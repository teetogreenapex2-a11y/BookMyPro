import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug, requireMembership, getBusinessInstructor } from "@/lib/tenant";
import { createEvent } from "@/lib/calendar";
import { createVideoCallRoom } from "@/lib/dailyVideo";
import { findFitting } from "@/lib/pricing";

// POST /api/{slug}/bookings/{id}/confirm — owner/instructor only.
// Approves a pending booking: marks it confirmed, marks the slot booked,
// and — since this is the first moment a pending booking is actually
// approved — creates the Google Calendar event now (not at request time).
export async function POST(
  req: NextRequest,
  { params }: { params: { slug: string; id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const membership = await requireMembership((session.user as any).id, business.id, ["owner", "instructor"]);
  if (!membership) return NextResponse.json({ error: "Instructor access required" }, { status: 403 });

  // Scoped by businessId so a booking id from a different business can never match here.
  const booking = await prisma.booking.findFirst({ where: { id: params.id, businessId: business.id } });
  if (!booking) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (booking.status !== "pending") {
    return NextResponse.json({ error: "This booking isn't pending" }, { status: 400 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.booking.update({ where: { id: booking.id }, data: { status: "confirmed" } });
    if (booking.availabilityId) {
      await tx.availability.update({ where: { id: booking.availabilityId }, data: { status: "booked" } });
    }
  });

  let videoCallUrl: string | null = null;
  if (booking.isRemote && business.dailyApiKey) {
    videoCallUrl = await createVideoCallRoom(business.dailyApiKey, booking.startTime);
    if (videoCallUrl) {
      await prisma.booking.update({ where: { id: booking.id }, data: { videoCallUrl } });
    }
  }

  const calendarMembership = await getBusinessInstructor(business.id);
  if (calendarMembership) {
    try {
      const isFitting = booking.serviceType === "fitting";
      const fitting = isFitting && booking.fittingType ? findFitting(booking.fittingType) : null;
      const eventId = await createEvent(business, calendarMembership, {
        summary: `${fitting ? fitting.label : booking.isRemote ? "Remote golf lesson" : "Golf lesson"} — ${booking.contactName || "Player"}`,
        description: `${isFitting ? "Club fitting" : "Lesson"} confirmed via ${business.name}. Contact: ${booking.contactPhone || "—"}, ${booking.contactEmail || "—"}.${videoCallUrl ? ` Video call: ${videoCallUrl}` : ""}`,
        startTime: booking.startTime,
        durationMinutes: fitting ? fitting.durationMin : 60,
      });
      if (eventId) {
        await prisma.booking.update({ where: { id: booking.id }, data: { googleCalendarEventId: eventId } });
      }
    } catch (err) {
      console.error("Calendar sync failed on confirm:", err);
    }
  }

  return NextResponse.json({ ok: true });
}
