import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug, getInstructorById, getBusinessInstructor, requireMembership } from "@/lib/tenant";
import { createEvent } from "@/lib/calendar";
import { createVideoCallRoom } from "@/lib/dailyVideo";
import { findFitting, getFittingPriceCents, isFittingEnabled } from "@/lib/pricing";

// POST /api/{slug}/bookings/manual  { availabilityId, serviceType, fittingType?, playerId, packageId?, instructorMembershipId }
// Owner/instructor only — for walk-ins, phone bookings, or anything the
// instructor is creating on a player's behalf directly. Unlike the normal
// player-facing booking flow, this always auto-confirms (skips approval —
// the instructor is the one approving it by creating it) and syncs to the
// calendar immediately.
//
// For a lesson: packageId is optional. If given, it must belong to the
// selected player and have credits remaining — one gets deducted, same as a
// normal booking. If omitted, this is a free-standing booking (e.g. the
// player pays cash in person) — no credit is touched, price isn't tracked.
// For a fitting: always priced from the business's current fitting rates,
// whether or not a package is involved (fittings don't draw from packages).
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const membership = await requireMembership((session.user as any).id, business.id, ["owner", "instructor"]);
  if (!membership) return NextResponse.json({ error: "Instructor access required" }, { status: 403 });

  const { availabilityId, serviceType, fittingType, playerId, packageId, instructorMembershipId, isRemote: submittedIsRemote } = await req.json();

  if (!["lesson", "fitting"].includes(serviceType)) {
    return NextResponse.json({ error: "Invalid service type" }, { status: 400 });
  }

  // Scoped by businessId so an id from a different business can never match here.
  const [slot, player, pkg, instructorMembership] = await Promise.all([
    prisma.availability.findFirst({ where: { id: availabilityId, businessId: business.id } }),
    prisma.membership.findFirst({ where: { userId: playerId, businessId: business.id, role: "player" }, include: { user: true } }),
    packageId ? prisma.package.findFirst({ where: { id: packageId, businessId: business.id } }) : Promise.resolve(null),
    instructorMembershipId ? getInstructorById(business.id, instructorMembershipId) : Promise.resolve(null),
  ]);

  if (!slot || slot.status !== "open") {
    return NextResponse.json({ error: "That slot is no longer available" }, { status: 409 });
  }
  if (!player) {
    return NextResponse.json({ error: "Player not found" }, { status: 404 });
  }
  if (!instructorMembership) {
    return NextResponse.json({ error: "Choose which instructor this booking is with" }, { status: 400 });
  }
  if (slot.instructorMembershipId !== instructorMembership.id) {
    return NextResponse.json({ error: "That slot belongs to a different instructor's calendar" }, { status: 400 });
  }

  // The "video" package is inherently remote regardless of what was submitted.
  const isRemote = pkg?.type === "video" || !!submittedIsRemote;
  let priceCents = 0;
  let fitting = null;

  if (serviceType === "fitting") {
    fitting = findFitting(fittingType);
    if (!fitting) return NextResponse.json({ error: "Unknown fitting type" }, { status: 400 });
    if (!isFittingEnabled(instructorMembership, fitting.id)) {
      return NextResponse.json({ error: "This fitting type isn't offered by this instructor" }, { status: 400 });
    }
    priceCents = getFittingPriceCents(instructorMembership, fitting.id);
  } else if (packageId) {
    if (!pkg || pkg.userId !== playerId || pkg.lessonsRemaining <= 0) {
      return NextResponse.json({ error: "That package isn't valid for this player" }, { status: 400 });
    }
    if (pkg.instructorMembershipId && pkg.instructorMembershipId !== instructorMembershipId) {
      return NextResponse.json({ error: "That package was bought for a different instructor" }, { status: 400 });
    }
  }

  const booking = await prisma.$transaction(async (tx) => {
    await tx.availability.update({ where: { id: availabilityId }, data: { status: "booked" } });
    if (serviceType === "lesson" && pkg) {
      await tx.package.update({ where: { id: pkg.id }, data: { lessonsRemaining: { decrement: 1 } } });
    }
    return tx.booking.create({
      data: {
        businessId: business.id,
        playerId,
        serviceType,
        fittingType: serviceType === "fitting" ? fitting!.id : null,
        isRemote: serviceType === "lesson" ? !!isRemote : false,
        startTime: slot.startTime,
        status: "confirmed",
        priceCents,
        packageId: serviceType === "lesson" && pkg ? pkg.id : null,
        availabilityId,
        instructorMembershipId,
        contactName: player.user.name,
        contactPhone: player.user.phone,
        contactEmail: player.user.email,
      },
    });
  });

  let videoCallUrl: string | null = null;
  if (serviceType === "lesson" && isRemote && business.dailyApiKey) {
    videoCallUrl = await createVideoCallRoom(business.dailyApiKey, slot.startTime);
    if (videoCallUrl) {
      await prisma.booking.update({ where: { id: booking.id }, data: { videoCallUrl } });
    }
  }

  const calendarMembership = await getBusinessInstructor(business.id);
  if (calendarMembership) {
    try {
      const eventId = await createEvent(business, calendarMembership, {
        summary: `${fitting ? fitting.label : isRemote ? "Remote golf lesson" : "Golf lesson"} — ${player.user.name || player.user.email}`,
        description: `${serviceType === "fitting" ? "Club fitting" : "Lesson"} booked manually by the instructor via ${business.name}.${videoCallUrl ? ` Video call: ${videoCallUrl}` : ""}`,
        startTime: slot.startTime,
        durationMinutes: fitting ? fitting.durationMin : 60,
      });
      if (eventId) {
        await prisma.booking.update({ where: { id: booking.id }, data: { googleCalendarEventId: eventId } });
      }
    } catch (err) {
      console.error("Calendar sync failed:", err);
    }
  }

  return NextResponse.json({ ...booking, videoCallUrl }, { status: 201 });
}
