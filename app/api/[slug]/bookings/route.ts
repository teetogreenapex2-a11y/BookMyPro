import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug, getInstructorById, getBusinessInstructor, getMembership } from "@/lib/tenant";
import { createEvent } from "@/lib/calendar";
import { createVideoCallRoom } from "@/lib/dailyVideo";
import { sendBookingNotification } from "@/lib/email";
import { businessDestination } from "@/lib/businessUrl";

// POST /api/{slug}/bookings  { availabilityId, packageId, instructorMembershipId, contactName, contactPhone, contactEmail }
// Lesson bookings only — they draw from an existing paid Package.
// Fitting bookings are created by the Stripe/Square webhook after payment.
//
// instructorMembershipId is which staff member the player chose to book
// with — the business still has one shared timeline (a slot is either open
// or booked, same as always), this just records who it's with.
//
// If the business has requireBookingApproval on, this creates a "pending"
// booking — the slot is held, the package credit is deducted immediately
// (refunded automatically if denied), but nothing syncs to Google Calendar
// until the instructor confirms it (see the /confirm route). If approval
// isn't required, this behaves exactly as before: confirmed immediately.
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const userId = (session.user as any).id;
  const { availabilityId, packageId, instructorMembershipId: submittedInstructorId, contactName, contactPhone, contactEmail, isRemote: submittedIsRemote } = await req.json();

  if (!contactName?.trim() || !contactPhone?.trim() || !contactEmail?.trim()) {
    return NextResponse.json({ error: "Name, phone, and email are required" }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
    return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
  }

  // Every lookup below is scoped to businessId — this is what stops someone
  // from booking a slot, or spending package credits, that belong to a
  // different business by guessing/reusing an id.
  const [slot, pkg] = await Promise.all([
    prisma.availability.findFirst({ where: { id: availabilityId, businessId: business.id } }),
    prisma.package.findFirst({ where: { id: packageId, businessId: business.id } }),
  ]);

  if (!slot || slot.status !== "open") {
    return NextResponse.json({ error: "That slot is no longer available" }, { status: 409 });
  }
  if (!pkg || pkg.userId !== userId || pkg.lessonsRemaining <= 0) {
    return NextResponse.json({ error: "No lesson credits available" }, { status: 400 });
  }

  // The "video" package is inherently remote regardless of what the client
  // sent — same reasoning as deriving the instructor from the package below.
  const isRemote = pkg.type === "video" || !!submittedIsRemote;
  // A package is tied to the instructor it was priced and paid for — derive
  // the instructor from the package itself rather than trusting whatever
  // the client separately submitted, so there's no way to pay one
  // instructor's rate and redeem the credit with a pricier one. Falls back
  // to the submitted value only for packages that predate this field.
  const instructorMembershipId = pkg.instructorMembershipId || submittedInstructorId;
  if (!instructorMembershipId) {
    return NextResponse.json({ error: "Choose which instructor you're booking with" }, { status: 400 });
  }
  const instructorMembership = await getInstructorById(business.id, instructorMembershipId);
  if (!instructorMembership) {
    return NextResponse.json({ error: "That instructor isn't available at this business" }, { status: 400 });
  }
  if (slot.instructorMembershipId !== instructorMembershipId) {
    return NextResponse.json({ error: "That slot belongs to a different instructor's calendar" }, { status: 400 });
  }

  const needsApproval = business.requireBookingApproval;
  const availabilityStatus = needsApproval ? "pending" : "booked";
  const bookingStatus = needsApproval ? "pending" : "confirmed";

  const booking = await prisma.$transaction(async (tx) => {
    await tx.availability.update({ where: { id: availabilityId }, data: { status: availabilityStatus } });
    await tx.package.update({
      where: { id: packageId },
      data: { lessonsRemaining: { decrement: 1 } },
    });
    return tx.booking.create({
      data: {
        businessId: business.id,
        playerId: userId,
        instructorMembershipId,
        serviceType: "lesson",
        isRemote: !!isRemote,
        startTime: slot.startTime,
        status: bookingStatus,
        priceCents: 0, // already paid for as part of the package
        packageId,
        availabilityId,
        contactName: contactName.trim(),
        contactPhone: contactPhone.trim(),
        contactEmail: contactEmail.trim(),
      },
    });
  });

  // Create the video call room first (if this is a remote lesson being
  // confirmed immediately) so its link can be included in the calendar
  // event description below, not just shown separately in the app.
  let videoCallUrl: string | null = null;
  if (!needsApproval && isRemote && business.dailyApiKey) {
    videoCallUrl = await createVideoCallRoom(business.dailyApiKey, slot.startTime);
    if (videoCallUrl) {
      await prisma.booking.update({ where: { id: booking.id }, data: { videoCallUrl } });
    }
  }

  // Sync to the business's shared Google Calendar right away — but only if
  // this booking didn't need approval. Pending bookings get synced once
  // confirmed (see the /confirm route), so nothing unapproved shows up on
  // the real calendar. This is one shared calendar connection regardless of
  // which instructor the booking is with — not per-instructor.
  if (!needsApproval) {
    const calendarMembership = await getBusinessInstructor(business.id);
    if (calendarMembership) {
    try {
      const eventId = await createEvent(business, calendarMembership, {
        summary: `${isRemote ? "Remote golf lesson" : "Golf lesson"} — ${contactName.trim()}`,
        description: `Lesson booked via ${business.name}. Contact: ${contactPhone.trim()}, ${contactEmail.trim()}.${videoCallUrl ? ` Video call: ${videoCallUrl}` : ""}`,
        startTime: slot.startTime,
        durationMinutes: 60,
      });
      if (eventId) {
        await prisma.booking.update({ where: { id: booking.id }, data: { googleCalendarEventId: eventId } });
      }
    } catch (err) {
      // Booking still succeeds even if calendar sync fails — log for follow-up.
      console.error("Calendar sync failed:", err);
    }
    }
  }

  if (business.notifyOnBooking) {
    // Awaited (not fire-and-forget) — in a serverless environment, an
    // un-awaited promise can get killed once the response is sent. The
    // function already catches its own errors internally, so this can't
    // fail the booking itself, just adds a small amount of latency.
    await sendBookingNotification(business.notificationEmail || business.email, {
      businessName: business.name,
      serviceLabel: "Lesson",
      startTime: slot.startTime,
      contactName: contactName.trim(),
      contactPhone: contactPhone.trim(),
      contactEmail: contactEmail.trim(),
      priceCents: 0,
      isPending: needsApproval,
      reviewUrl: needsApproval ? businessDestination(business.slug, "/instructor") : undefined,
    });
  }

  return NextResponse.json(booking, { status: 201 });
}

// GET /api/{slug}/bookings — the current user's bookings at this business
// (or every booking at this business, if they're the owner/instructor)
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const userId = (session.user as any).id;
  const membership = await getMembership(userId, business.id);
  const isStaff = membership?.role === "owner" || membership?.role === "instructor";

  const bookings = await prisma.booking.findMany({
    where: isStaff ? { businessId: business.id } : { businessId: business.id, playerId: userId },
    include: {
      note: true,
      player: { select: { name: true, email: true, handedness: true, scoreOrHandicap: true, commonIssues: true } },
      instructor: { select: { id: true, user: { select: { name: true } } } },
    },
    orderBy: { startTime: "asc" },
  });

  return NextResponse.json(bookings);
}
