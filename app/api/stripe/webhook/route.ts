import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { findPackage, findFitting } from "@/lib/pricing";
import { createEvent } from "@/lib/calendar";
import { createVideoCallRoom } from "@/lib/dailyVideo";
import { getBusinessInstructor, ensureMembership } from "@/lib/tenant";
import { sendBookingNotification } from "@/lib/email";
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
      const pkg = findPackage(meta.packageType);
      if (pkg) {
        await ensureMembership(meta.userId, businessId, "player");
        const createdPackage = await prisma.package.create({
          data: {
            businessId,
            userId: meta.userId,
            instructorMembershipId: meta.instructorMembershipId || null,
            type: pkg.id,
            lessonsTotal: pkg.lessons,
            lessonsRemaining: pkg.lessons,
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

            if (!needsApproval) {
              let videoCallUrl: string | null = null;
              if (booking.isRemote && business.dailyApiKey) {
                videoCallUrl = await createVideoCallRoom(business.dailyApiKey, slot.startTime);
                if (videoCallUrl) {
                  await prisma.booking.update({ where: { id: booking.id }, data: { videoCallUrl } });
                }
              }
              const calendarMembership = await getBusinessInstructor(businessId);
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
              await sendBookingNotification(business.notificationEmail || business.email, {
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
          const calendarMembership = await getBusinessInstructor(businessId);
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
          await sendBookingNotification(business.notificationEmail || business.email, {
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

  return NextResponse.json({ received: true });
}
