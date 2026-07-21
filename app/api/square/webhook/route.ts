import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySquareWebhookSignature, getSquareOrder } from "@/lib/square";
import { findPackage, findFitting } from "@/lib/pricing";
import { createEvent } from "@/lib/calendar";
import { createVideoCallRoom } from "@/lib/dailyVideo";
import { getBusinessInstructor, ensureMembership } from "@/lib/tenant";
import { sendBookingNotification } from "@/lib/email";
import { businessDestination } from "@/lib/businessUrl";

// Square webhook — subscribe to "payment.updated" in the Square Developer
// Dashboard, pointed at this URL. Verifies the signature, and only acts once
// a payment reaches "COMPLETED" (Square sends multiple statuses over time).
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-square-hmacsha256-signature") || "";
  const notificationUrl = `${process.env.NEXTAUTH_URL}/api/square/webhook`;

  const valid = await verifySquareWebhookSignature(rawBody, signature, notificationUrl);
  if (!valid) {
    console.error("Square webhook signature verification failed");
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const event = JSON.parse(rawBody);
  if (event.type !== "payment.updated") return NextResponse.json({ received: true });

  const payment = event.data?.object?.payment;
  if (!payment || payment.status !== "COMPLETED") return NextResponse.json({ received: true });

  const orderId = payment.order_id;
  const merchantId = event.merchant_id;
  if (!orderId || !merchantId) return NextResponse.json({ received: true });

  // Webhook payloads don't carry a usable access token, so the connected
  // business is looked up by merchant_id first — then *their own* stored
  // token is used to fetch the Order and read back the reference_id we set
  // when creating the Payment Link (Square's payment.reference_id isn't
  // reliably populated from an Order-based payment link, so this is the
  // more defensible path — see lib/square.ts).
  const business = await prisma.business.findFirst({ where: { squareMerchantId: merchantId, paymentProvider: "square" } });
  if (!business?.squareAccessToken) return NextResponse.json({ received: true });

  let referenceId: string | undefined;
  try {
    const order = await getSquareOrder(business.squareAccessToken, orderId);
    referenceId = order.reference_id;
  } catch (e) {
    console.error("Failed to fetch Square order for webhook:", e);
    return NextResponse.json({ received: true });
  }
  if (!referenceId) return NextResponse.json({ received: true });

  const pending = await prisma.pendingSquarePayment.findUnique({ where: { id: referenceId } });
  if (!pending) return NextResponse.json({ received: true }); // already processed, or not ours

  const businessId = pending.businessId;

  if (pending.kind === "package" && pending.packageType) {
    const pkg = findPackage(pending.packageType);
    if (pkg) {
      await ensureMembership(pending.userId, businessId, "player");
      const createdPackage = await prisma.package.create({
        data: {
          businessId,
          userId: pending.userId,
          instructorMembershipId: pending.instructorMembershipId,
          type: pkg.id,
          lessonsTotal: pkg.lessons,
          lessonsRemaining: pkg.lessons,
          pricePaidCents: payment.amount_money?.amount ?? 0,
          squareOrderId: orderId,
        },
      });

      // A slot was picked before paying — book it now with the first credit
      // from the package that was just created. If the slot got taken by
      // someone else in the meantime (race condition), the package still
      // gets created so the player isn't out their money — they just pick a
      // different time on the booking page afterward.
      if (pending.availabilityId) {
        const slot = await prisma.availability.findFirst({
          where: { id: pending.availabilityId, businessId, instructorMembershipId: pending.instructorMembershipId, status: "open" },
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
                playerId: pending.userId,
                serviceType: "lesson",
                isRemote: pending.isRemote,
                startTime: slot.startTime,
                status: needsApproval ? "pending" : "confirmed",
                priceCents: 0, // already paid for as part of the package
                packageId: createdPackage.id,
                availabilityId: slot.id,
                instructorMembershipId: pending.instructorMembershipId,
                contactName: pending.contactName,
                contactPhone: pending.contactPhone,
                contactEmail: pending.contactEmail,
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
                  summary: `${booking.isRemote ? "Remote golf lesson" : "Golf lesson"} — ${pending.contactName || "Player"}`,
                  description: `Lesson booked via ${business.name}. Contact: ${pending.contactPhone || "—"}, ${pending.contactEmail || "—"}.${videoCallUrl ? ` Video call: ${videoCallUrl}` : ""}`,
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
              contactName: pending.contactName,
              contactPhone: pending.contactPhone,
              contactEmail: pending.contactEmail,
              priceCents: 0,
              isPending: needsApproval,
              reviewUrl: needsApproval ? businessDestination(business.slug, "/instructor") : undefined,
            });
          }
        }
      }
    }
  }

  if (pending.kind === "fitting" && pending.fittingType && pending.availabilityId) {
    const fitting = findFitting(pending.fittingType);
    const slot = await prisma.availability.findFirst({
      where: { id: pending.availabilityId, businessId, instructorMembershipId: pending.instructorMembershipId },
    });

    if (fitting && slot && slot.status === "open") {
      await ensureMembership(pending.userId, businessId, "player");

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
            playerId: pending.userId,
            serviceType: "fitting",
            fittingType: fitting.id,
            startTime: slot.startTime,
            status: bookingStatus,
            priceCents: payment.amount_money?.amount ?? 0,
            squareOrderId: orderId,
            availabilityId: slot.id,
            instructorMembershipId: pending.instructorMembershipId,
            contactName: pending.contactName,
            contactPhone: pending.contactPhone,
            contactEmail: pending.contactEmail,
          },
        });
      });

      if (!needsApproval) {
        const calendarMembership = await getBusinessInstructor(businessId);
        if (calendarMembership) {
          try {
            const eventId = await createEvent(business, calendarMembership, {
              summary: `${fitting.label} — ${pending.contactName || "Player"}`,
              description: `Club fitting booked. Contact: ${pending.contactPhone || "—"}, ${pending.contactEmail || "—"}.`,
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
          contactName: pending.contactName,
          contactPhone: pending.contactPhone,
          contactEmail: pending.contactEmail,
          priceCents: payment.amount_money?.amount ?? 0,
          isPending: needsApproval,
          reviewUrl: needsApproval ? businessDestination(business.slug, "/instructor") : undefined,
        });
      }
    }
  }

  // Consumed — remove so a duplicate webhook delivery (Square retries) can't double-process it.
  await prisma.pendingSquarePayment.delete({ where: { id: pending.id } }).catch(() => {});

  return NextResponse.json({ received: true });
}
