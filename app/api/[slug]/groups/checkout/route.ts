import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug } from "@/lib/tenant";

// GET /api/{slug}/groups
// No auth needed, same as the main availability route - the booking page
// needs this to show upcoming group lessons before a player has even
// picked an instructor, so it can't be scoped to one instructor the way
// the calendar itself is.
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const slots = await prisma.availability.findMany({
    where: {
      businessId: business.id,
      isGroup: true,
      status: "open", // excludes full and closed - only genuinely joinable sessions show here
      startTime: { gte: new Date() },
      instructor: { hiddenFromBooking: false },
    },
    include: {
      instructor: { include: { user: { select: { name: true } } } },
      bookings: { where: { status: { not: "cancelled" } } },
    },
    orderBy: { startTime: "asc" },
  });

  return NextResponse.json(
    slots.map((s) => ({
      id: s.id,
      startTime: s.startTime,
      instructorMembershipId: s.instructorMembershipId,
      instructorName: s.instructor.user.name || "Your pro",
      groupCapacity: s.groupCapacity,
      groupPriceCents: s.groupPriceCents,
      groupSpotsTaken: s.bookings.length,
    }))
  );
}
