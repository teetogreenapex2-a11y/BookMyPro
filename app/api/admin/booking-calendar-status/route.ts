import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug, isPlatformAdmin } from "@/lib/tenant";

// GET /api/admin/booking-calendar-status?slug=tee-to-green-golf
//
// Shows the actual stored googleCalendarEventId/status/instructor for the
// most recent bookings, so a "still on the calendar after canceling" report
// can be checked against real data instead of guessed at. Temporary; safe
// to delete once this is resolved.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const isAdmin = await isPlatformAdmin((session.user as any).id);
  if (!isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const slug = req.nextUrl.searchParams.get("slug");
  if (!slug) return NextResponse.json({ error: "Pass ?slug=..." }, { status: 400 });

  const business = await getBusinessBySlug(slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const bookings = await prisma.booking.findMany({
    where: { businessId: business.id },
    orderBy: { createdAt: "desc" },
    take: 10,
    include: { instructor: { include: { user: true } }, availability: true },
  });

  return NextResponse.json({
    bookings: bookings.map((b) => ({
      id: b.id,
      status: b.status,
      startTime: b.startTime,
      createdAt: b.createdAt,
      googleCalendarEventId: b.googleCalendarEventId,
      availabilityId: b.availabilityId,
      availabilitySlotStatus: b.availability?.status ?? null,
      instructor: b.instructor ? { membershipId: b.instructor.id, email: b.instructor.user.email, hasGoogleToken: !!b.instructor.googleRefreshToken } : null,
    })),
  });
}
