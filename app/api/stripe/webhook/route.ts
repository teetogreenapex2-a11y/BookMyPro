import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { findPackage, findFitting } from "@/lib/pricing";
import { createEvent } from "@/lib/calendar";
import { createVideoCallRoom } from "@/lib/dailyVideo";
import { getInstructorById, ensureMembership, getBookingNotificationRecipients } from "@/lib/tenant";
import { sendBookingNotification } from "@/lib/email";
import { sendPushToMembership, checkAndNotifyLowPackage } from "@/lib/pushNotifications";
import { BUSINESS_TIMEZONE } from "@/lib/time";
import { businessDestination } from "@/lib/businessUrl";

// Stripe requires the raw request body to verify the webhook signature,
// so this route must NOT use the default JSON body parsing.
export const runtime = "nodejs";

// This endpoint stays at a single fixed URL (Stripe webhooks are registered
// per-endpoint) — every checkout session carries its businessId in metadata
// (set by /api/{slug}/packages/checkout and /api/{slug}/fittings/checkout),
// which is how each event gets routed back to the right business here.
//
// Since checkout sessions are now created as direct charges on each
// business's connected Stripe account (via the stripeAccount request
// option), these events arrive as Connect events. In the Stripe Dashboard,
// enable "Listen to events on Connected accounts" on this endpoint so it
// receives them — no separate endpoint/secret needed, they use the same
// signing secret as your platform-level events.
export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig!, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err) {
    console.error("Stripe webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;

    // Platform billing (the business paying BookMyPro itself) - checked
    // first and handled entirely separately, since these sessions never
    // carry meta.businessId at all, only client_reference_id, and never
    // happen on a connected account (event.account is always absent
    // here, unlike every path below this one).
    if (session.mode === "subscription") {
      const businessId = session.client_reference_id;
      if (!businessId) return NextResponse.json({ received: true });

      const business = await prisma.business.findUnique({ where: { id: businessId } });
      if (!business) return NextResponse.json({ received: true });

      const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
      if (!subscriptionId) return NextResponse.json({ received: true });

      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      // Only present for an Academy subscription (the base-fee-only
      // Monthly tier has no per-instructor line item at all) - stored
      // separately so its quantity can be updated later without ever
      // touching the base-fee item.
      const instructorItem = subscription.items.data.find((item) => item.price.id === "price_1UBJlo4uMHGraF5nnGIjrp0Q");

      await prisma.business.update({
        where: { id: business.id },
        data: {
          platformStripeCustomerId: typeof session.customer === "string" ? session.customer : session.customer?.id,
          platformStripeSubscriptionId: subscriptionId,
          platformInstructorItemId: instructorItem?.id || null,
          subscriptionStatus: "active",
        },
      });

      return NextResponse.json({ received: true });
    }

    const meta = session.metadata || {};
    const businessId = meta.businessId;
    if (!businessId) return NextResponse.json({ received: true }); // malformed/legacy session, nothing to do

    const business = await prisma.business.findUnique({ where: { id: businessId } });
    if (!business) return NextResponse.json({ received: true });

    // Defensive check: confirm this event's connected account actually
    // belongs to the business named in metadata, in case metadata was ever
    // tampered with or a session got misrouted. `event.account` is Stripe's
    // own record of which connected account generated this event.
    if (event.account && business.stripeAccountId !== event.account) {
      console.error(`Webhook account mismatch: event.account=${event.account} vs business.stripeAccountId for businessId=${businessId}`);
      return NextResponse.json({ received: true });
    }

    if (meta.kind === "package") {
      // "duration" is the new, instructor-defined lesson-length system
      // (see LessonDuration/LessonPackageOption in schema.prisma) - the
      // pkg-lookup path below it is the original, fixed-tier system,
      // completely unchanged, and still the only path for any instructor
      // who hasn't set up their own durations.
      const isCustomPurchase = meta.packageType === "custom";
      const isDurationPurchase = meta.packageType === "duration";
      const pkg = (isCustomPurchase || isDurationPurchase) ? null : findPackage(meta.packageType);
      if (isCustomPurchase || isDurationPurchase || pkg) {
        await ensureMembership(meta.userId, businessId, "player");
        const createdPackage = await prisma.package.create({
          data: {
            businessId,
            userId: meta.userId,
            instructorMembershipId: meta.instructorMembershipId || null,
            type: isCustomPurchase ? "custom" : isDurationPurchase ? "duration" : pkg!.id,
            durationMinutes: isDurationPurchase && meta.durationMinutes ? parseInt(meta.durationMinutes, 10) : null,
            durationLabel: (isDurationPurchase || isCustomPurchase) && meta.durationLabel ? meta.durationLabel : null,
            // For a duration or custom-offering purchase, lessonsTotal has
            // to come from Stripe's own line item quantity/amount rather
            // than a static lookup - the actual count was already
            // validated server-side when the checkout session was
            // created, so the amount actually charged is what's trusted
            // here, same as the existing system already does via
            // session.amount_total.
            lessonsTotal: (isDurationPurchase || isCustomPurchase) ? (meta.lessonsTotal ? parseInt(meta.lessonsTotal, 10) : 1) : pkg!.lessons,
            lessonsRemaining: (isDurationPurchase || isCustomPurchase) ? (meta.lessonsTotal ? parseInt(meta.lessonsTotal, 10) : 1) : pkg!.lessons,
            pricePaidCents: session.amount_total ?? 0,
            stripeSessionId: session.id,
          },
        });

        // A slot was picked before paying — book it now with the first
        // credit from the package that was just created. If the slot got
        // taken by someone else in the meantime (race condition), the
        // package still gets created so the player isn't out their money —
        // they just pick a different time on the booking page afterward.
        if (meta.availabilityId) {
          const slot = await prisma.availability.findFirst({
            where: { id: meta.availabilityId, businessId, instructorMembershipId: meta.instructorMembershipId, status: "open" },
          });
          if (slot) {
            const needsApproval = business.requireBookingApproval;
            const booking = await prisma.$transaction(async (tx) => {
              await tx.availability.update({
                where: { id: slot.id },
                data: { status: needsApproval ? "pending" : "booked" },
              });
              await tx.package.update({
                where: { id: createdPackage.id },
                data: { lessonsRemaining: { decrement: 1 } },
              });
              return tx.booking.create({
                data: {
                  businessId,
                  playerId: meta.userId,
                  serviceType: "lesson",
                  isRemote: meta.isRemote === "true",
                  startTime: slot.startTime,
                  status: needsApproval ? "pending" : "confirmed",
                  priceCents: 0, // already paid for as part of the package
                  packageId: createdPackage.id,
                  availabilityId: slot.id,
                  instructorMembershipId: meta.instructorMembershipId || null,
                  contactName: meta.contactName || null,
                  contactPhone: meta.contactPhone || null,
                  contactEmail: meta.contactEmail || null,
                },
              });
            });

            await checkAndNotifyLowPackage(createdPackage.id);

            if (!needsApproval) {
              let videoCallUrl: string | null = null;
              if (booking.isRemote && business.dailyApiKey) {
                videoCallUrl = await createVideoCallRoom(business.dailyApiKey, slot.startTime);
                if (videoCallUrl) {
                  await prisma.booking.update({ where: { id: booking.id }, data: { videoCallUrl } });
                }
              }
              const calendarMembership = booking.instructorMembershipId
                ? await getInstructorById(businessId, booking.instructorMembershipId)
                : null;
              if (calendarMembership) {
                try {
                  const eventId = await createEvent(business, calendarMembership, {
                    summary: `${booking.isRemote ? "Remote golf lesson" : "Golf lesson"} — ${meta.contactName || "Player"}`,
                    description: `Lesson booked via ${business.name}. Contact: ${meta.contactPhone || "—"}, ${meta.contactEmail || "—"}.${videoCallUrl ? ` Video call: ${videoCallUrl}` : ""}`,
                    startTime: slot.startTime,
                    durationMinutes: 60,
                  });
                  if (eventId) {
                    await prisma.booking.update({ where: { id: booking.id }, data: { googleCalendarEventId: eventId } });
                  }
                } catch (err) {
                  console.error("Calendar sync failed:", err);
                }
              }
            }

            if (business.notifyOnBooking) {
              await sendBookingNotification(await getBookingNotificationRecipients(business, meta.instructorMembershipId), {
                businessName: business.name,
                serviceLabel: "Lesson",
                startTime: slot.startTime,
                contactName: meta.contactName || null,
                contactPhone: meta.contactPhone || null,
                contactEmail: meta.contactEmail || null,
                priceCents: 0,
                isPending: needsApproval,
                reviewUrl: needsApproval ? businessDestination(business.slug, "/instructor") : undefined,
              });
            }
            await sendPushToMembership(meta.instructorMembershipId, {
              title: needsApproval ? "New booking request" : "New booking",
              body: `${meta.contactName || "A player"} - ${slot.startTime.toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: BUSINESS_TIMEZONE })}`,
              url: businessDestination(business.slug, "/instructor"),
            });
          }
        }
      }
    }

    // Genuinely the same flow as a regular package purchase above, with
    // one real difference: what's on file as "paid" is the deposit
    // actually charged today, with the rest tracked as a real balance
    // still owed - collected in person at the first lesson, not
    // automatically.
    if (meta.kind === "package_deposit") {
      const pkg = findPackage(meta.packageType);
      if (pkg) {
        const fullPriceCents = parseInt(meta.fullPriceCents || "0", 10);
        const depositChargedCents = session.amount_total ?? 0;
        await ensureMembership(meta.userId, businessId, "player");
        const createdPackage = await prisma.package.create({
          data: {
            businessId,
            userId: meta.userId,
            instructorMembershipId: meta.instructorMembershipId || null,
            type: pkg.id,
            lessonsTotal: pkg.lessons,
            lessonsRemaining: pkg.lessons,
            pricePaidCents: fullPriceCents,
            balanceDueCents: Math.max(0, fullPriceCents - depositChargedCents),
            paymentStatus: "deposit_paid",
            stripeSessionId: session.id,
          },
        });

        if (meta.availabilityId) {
          const slot = await prisma.availability.findFirst({
            where: { id: meta.availabilityId, businessId, instructorMembershipId: meta.instructorMembershipId, status: "open" },
          });
          if (slot) {
            const needsApproval = business.requireBookingApproval;
            const booking = await prisma.$transaction(async (tx) => {
              await tx.availability.update({
                where: { id: slot.id },
                data: { status: needsApproval ? "pending" : "booked" },
              });
              await tx.package.update({
                where: { id: createdPackage.id },
                data: { lessonsRemaining: { decrement: 1 } },
              });
              return tx.booking.create({
                data: {
                  businessId,
                  playerId: meta.userId,
                  serviceType: "lesson",
                  isRemote: meta.isRemote === "true",
                  startTime: slot.startTime,
                  status: needsApproval ? "pending" : "confirmed",
                  priceCents: 0,
                  packageId: createdPackage.id,
                  availabilityId: slot.id,
                  instructorMembershipId: meta.instructorMembershipId || null,
                  contactName: meta.contactName || null,
                  contactPhone: meta.contactPhone || null,
                  contactEmail: meta.contactEmail || null,
                },
              });
            });

            await checkAndNotifyLowPackage(createdPackage.id);

            if (!needsApproval) {
              let videoCallUrl: string | null = null;
              if (booking.isRemote && business.dailyApiKey) {
                videoCallUrl = await createVideoCallRoom(business.dailyApiKey, slot.startTime);
                if (videoCallUrl) {
                  await prisma.booking.update({ where: { id: booking.id }, data: { videoCallUrl } });
                }
              }
              const calendarMembership = booking.instructorMembershipId
                ? await getInstructorById(businessId, booking.instructorMembershipId)
                : null;
              if (calendarMembership) {
                try {
                  const eventId = await createEvent(business, calendarMembership, {
                    summary: `${booking.isRemote ? "Remote golf lesson" : "Golf lesson"} — ${meta.contactName || "Player"}`,
                    description: `Lesson booked via ${business.name}. Contact: ${meta.contactPhone || "—"}, ${meta.contactEmail || "—"}.${videoCallUrl ? ` Video call: ${videoCallUrl}` : ""}`,
                    startTime: slot.startTime,
                    durationMinutes: 60,
                  });
                  if (eventId) {
                    await prisma.booking.update({ where: { id: booking.id }, data: { googleCalendarEventId: eventId } });
                  }
                } catch (err) {
                  console.error("Calendar sync failed:", err);
                }
              }
            }

            if (business.notifyOnBooking) {
              await sendBookingNotification(await getBookingNotificationRecipients(business, meta.instructorMembershipId), {
                businessName: business.name,
                serviceLabel: "Lesson (deposit paid)",
                startTime: slot.startTime,
                contactName: meta.contactName || null,
                contactPhone: meta.contactPhone || null,
                contactEmail: meta.contactEmail || null,
                priceCents: 0,
                isPending: needsApproval,
                reviewUrl: needsApproval ? businessDestination(business.slug, "/instructor") : undefined,
              });
            }
            await sendPushToMembership(meta.instructorMembershipId, {
              title: needsApproval ? "New booking request" : "New booking",
              body: `${meta.contactName || "A player"} - ${slot.startTime.toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: BUSINESS_TIMEZONE })} - deposit paid, balance due at lesson`,
              url: businessDestination(business.slug, "/instructor"),
            });
          }
        }
      }
    }

    if (meta.kind === "fitting") {
      const fitting = findFitting(meta.fittingType);
      const slot = await prisma.availability.findFirst({
        where: { id: meta.availabilityId, businessId, instructorMembershipId: meta.instructorMembershipId },
      });

      if (fitting && slot && slot.status === "open") {
        await ensureMembership(meta.userId, businessId, "player");

        // Payment already succeeded at this point either way — approval
        // (when required) is only about the *time slot*, not the payment.
        // A denied request still needs manual refunding, same as any other
        // paid booking the instructor turns down.
        const needsApproval = business.requireBookingApproval;
        const availabilityStatus = needsApproval ? "pending" : "booked";
        const bookingStatus = needsApproval ? "pending" : "confirmed";

        const booking = await prisma.$transaction(async (tx) => {
          await tx.availability.update({ where: { id: slot.id }, data: { status: availabilityStatus } });
          return tx.booking.create({
            data: {
              businessId,
              playerId: meta.userId,
              serviceType: "fitting",
              fittingType: fitting.id,
              startTime: slot.startTime,
              status: bookingStatus,
              priceCents: session.amount_total ?? 0,
              stripeSessionId: session.id,
              availabilityId: slot.id,
              instructorMembershipId: meta.instructorMembershipId || null,
              contactName: meta.contactName || null,
              contactPhone: meta.contactPhone || null,
              contactEmail: meta.contactEmail || null,
            },
          });
        });

        // Only sync to the calendar immediately if this didn't need
        // approval — pending ones sync once confirmed (see the /confirm route).
        if (!needsApproval) {
          const calendarMembership = booking.instructorMembershipId
            ? await getInstructorById(businessId, booking.instructorMembershipId)
            : null;
          if (calendarMembership) {
            try {
              const eventId = await createEvent(business, calendarMembership, {
                summary: `${fitting.label} — ${meta.contactName || "Player"}`,
                description: `Club fitting booked. Contact: ${meta.contactPhone || "—"}, ${meta.contactEmail || "—"}.`,
                startTime: slot.startTime,
                durationMinutes: fitting.durationMin,
              });
              if (eventId) {
                await prisma.booking.update({ where: { id: booking.id }, data: { googleCalendarEventId: eventId } });
              }
            } catch (err) {
              console.error("Calendar sync failed:", err);
            }
          }
        }

        if (business.notifyOnBooking) {
          await sendBookingNotification(await getBookingNotificationRecipients(business, meta.instructorMembershipId), {
            businessName: business.name,
            serviceLabel: fitting.label,
            startTime: slot.startTime,
            contactName: meta.contactName || null,
            contactPhone: meta.contactPhone || null,
            contactEmail: meta.contactEmail || null,
            priceCents: session.amount_total ?? 0,
            isPending: needsApproval,
            reviewUrl: needsApproval ? businessDestination(business.slug, "/instructor") : undefined,
          });
        }
        await sendPushToMembership(meta.instructorMembershipId, {
          title: needsApproval ? "New booking request" : "New booking",
          body: `${meta.contactName || "A player"} - ${fitting.label}`,
          url: businessDestination(business.slug, "/instructor"),
        });
      }
    }

    if (meta.kind === "group") {
      // Re-checked here, not just at checkout start, since two people
      // could genuinely be checking out for the same session's last spot
      // at nearly the same moment - whoever's payment webhook lands first
      // gets it, the other gets refunded automatically below.
      const slot = await prisma.availability.findFirst({
        where: { id: meta.availabilityId, businessId },
        include: { bookings: { where: { status: { not: "cancelled" } } } },
      });

      if (slot && slot.isGroup && slot.groupCapacity && slot.bookings.length < slot.groupCapacity) {
        await ensureMembership(meta.userId, businessId, "player");

        const booking = await prisma.$transaction(async (tx) => {
          const created = await tx.booking.create({
            data: {
              businessId,
              playerId: meta.userId,
              serviceType: "lesson",
              startTime: slot.startTime,
              status: "confirmed",
              priceCents: session.amount_total ?? 0,
              stripeSessionId: session.id,
              availabilityId: slot.id,
              instructorMembershipId: meta.instructorMembershipId || null,
              contactName: meta.contactName || null,
              contactPhone: meta.contactPhone || null,
              contactEmail: meta.contactEmail || null,
            },
          });
          // Now full? Mark it so - otherwise a group slot just stays
          // "open" the whole time players are joining, unlike a private
          // lesson slot which flips to "booked" the moment it has one.
          const newCount = slot.bookings.length + 1;
          if (newCount >= slot.groupCapacity!) {
            await tx.availability.update({ where: { id: slot.id }, data: { status: "full" } });
          }
          return created;
        });

        if (business.notifyOnBooking) {
          await sendBookingNotification(await getBookingNotificationRecipients(business, meta.instructorMembershipId), {
            businessName: business.name,
            serviceLabel: "Group lesson",
            startTime: slot.startTime,
            contactName: meta.contactName || null,
            contactPhone: meta.contactPhone || null,
            contactEmail: meta.contactEmail || null,
            priceCents: session.amount_total ?? 0,
            isPending: false,
          });
        }
        await sendPushToMembership(meta.instructorMembershipId, {
          title: "New group lesson signup",
          body: `${meta.contactName || "A player"} joined the group session`,
          url: businessDestination(business.slug, "/instructor"),
        });
      } else if (business.stripeAccountId) {
        // The session filled up between checkout starting and payment
        // landing - refund automatically rather than leaving a player
        // charged for a spot that no longer exists.
        try {
          await stripe.refunds.create(
            { payment_intent: session.payment_intent as string },
            { stripeAccount: business.stripeAccountId }
          );
        } catch (err) {
          console.error("Group session full - refund failed:", err);
        }
      }
    }

    if (meta.kind === "order") {
      // The order and its items already exist (created when checkout
      // started, see POST /orders) — payment succeeding just flips it to
      // paid. Stock was already reserved at creation time, not here.
      const order = await prisma.order.findUnique({ where: { id: meta.orderId } });
      if (order && order.status === "pending") {
        await prisma.order.update({ where: { id: order.id }, data: { status: "paid" } });
      }
    }

    if (meta.kind === "gift_card") {
      const { generateGiftCardCode } = await import("@/lib/giftCards");
      const code = await generateGiftCardCode();
      const amountCents = Number(meta.amountCents) || session.amount_total || 0;
      const giftCard = await prisma.giftCard.create({
        data: {
          businessId,
          code,
          initialValueCents: amountCents,
          remainingValueCents: amountCents,
          purchasedByUserId: meta.userId,
          recipientName: meta.recipientName || null,
          recipientEmail: meta.recipientEmail || null,
          message: meta.message || null,
          stripeSessionId: session.id,
        },
      });
      const deliverTo = meta.recipientEmail || session.customer_email;
      if (deliverTo) {
        const { sendGiftCardEmail } = await import("@/lib/email");
        await sendGiftCardEmail(deliverTo, {
          businessName: business.name,
          code: giftCard.code,
          amountCents,
          recipientName: meta.recipientName || null,
          message: meta.message || null,
        }).catch((err) => console.error("Gift card email failed:", err));
      }
    }
  }

  // --- Platform billing (the business paying BookMyPro itself) ---
  // Deliberately separate from every event handler above, which are all
  // about a business's own connected account receiving money from
  // their players - these three are the only ones about the business
  // itself being charged, on the platform's own account.

  if (event.type === "invoice.payment_failed") {
    const invoice = event.data.object as Stripe.Invoice;
    const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
    if (customerId) {
      const business = await prisma.business.findFirst({
        where: { platformStripeCustomerId: customerId },
        include: { memberships: { where: { role: "owner" }, include: { user: { select: { name: true, email: true } } } } },
      });
      if (business) {
        await prisma.business.update({ where: { id: business.id }, data: { subscriptionStatus: "past_due" } });

        // Same admin lookup pattern as the trial-expiry cron - nothing
        // happens to the business's own access automatically, this
        // just starts a real, human follow-up.
        const adminBusiness = await prisma.business.findUnique({ where: { slug: "tee-to-green-golf" } });
        const adminMembership = adminBusiness
          ? await prisma.membership.findFirst({ where: { businessId: adminBusiness.id, role: "owner" }, include: { user: true } })
          : null;
        if (adminMembership?.user.email) {
          const { sendPlatformPaymentFailedNotification } = await import("@/lib/email");
          await sendPlatformPaymentFailedNotification(adminMembership.user.email, {
            businessName: business.name,
            ownerName: business.memberships[0]?.user.name || null,
            ownerEmail: business.memberships[0]?.user.email || null,
          }).catch((err) => console.error("Platform payment-failed email failed:", err));
        }
      }
    }
  }

  if (event.type === "customer.subscription.deleted") {
    const subscription = event.data.object as Stripe.Subscription;
    const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id;
    if (customerId) {
      await prisma.business.updateMany({
        where: { platformStripeCustomerId: customerId },
        data: { subscriptionStatus: "cancelled" },
      });
    }
  }

  if (event.type === "invoice.paid") {
    // Recovery case - a card that previously failed and got fixed
    // shouldn't need a manual admin visit to get flipped back to
    // active. This also fires for the very first, initial payment
    // (already set to "active" by checkout.session.completed above),
    // which is harmless - setting the same status twice does nothing.
    const invoice = event.data.object as Stripe.Invoice;
    const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
    if (customerId) {
      await prisma.business.updateMany({
        where: { platformStripeCustomerId: customerId, subscriptionStatus: "past_due" },
        data: { subscriptionStatus: "active" },
      });
    }
  }

  return NextResponse.json({ received: true });
}
