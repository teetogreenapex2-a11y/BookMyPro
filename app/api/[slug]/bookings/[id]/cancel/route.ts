import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug, getBusinessInstructor, getMembership } from "@/lib/tenant";
import { deleteEvent } from "@/lib/calendar";

export async function POST(
  req: NextRequest,
  { params }: { params: { slug: string; id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const userId = (session.user as any).id;
  const membership = await getMembership(userId, business.id);
  const isStaff = membership?.role === "owner" || membership?.role === "instructor";

  // Scoped by businessId so a booking id from a different business can never match here.
  const booking = await prisma.booking.findFirst({ where: { id: params.id, businessId: business.id } });
  if (!booking) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (booking.playerId !== userId && !isStaff) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  if (booking.status === "cancelled") {
    return NextResponse.json({ error: "Already cancelled" }, { status: 400 });
  }

  const calendarMembership = await getBusinessInstructor(business.id);

  await prisma.$transaction(async (tx) => {
    await tx.booking.update({ where: { id: booking.id }, data: { status: "cancelled" } });
    if (booking.availabilityId) {
      await tx.availability.update({ where: { id: booking.availabilityId }, data: { status: "open" } });
    }
    if (booking.packageId) {
      await tx.package.update({ where: { id: booking.packageId }, data: { lessonsRemaining: { increment: 1 } } });
    }
  });

  if (calendarMembership && booking.googleCalendarEventId) {
    try {
      await deleteEvent(business, calendarMembership, booking.googleCalendarEventId);
    } catch (err) {
      console.error("Failed to remove calendar event:", err);
    }
  }

  return NextResponse.json({ ok: true });
}
