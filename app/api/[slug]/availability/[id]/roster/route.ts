import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug, requireMembership } from "@/lib/tenant";

// GET /api/{slug}/availability/{id}/roster
// Instructor/owner only - the main GET /availability route deliberately
// never includes player names in its response (it has no auth check at
// all, since the public booking page needs to read it), so the actual
// roster for a group lesson lives here instead, behind a real
// membership check.
export async function GET(req: NextRequest, { params }: { params: { slug: string; id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const membership = await requireMembership((session.user as any).id, business.id, ["owner", "instructor"]);
  if (!membership) return NextResponse.json({ error: "Instructor access required" }, { status: 403 });

  const slot = await prisma.availability.findFirst({ where: { id: params.id, businessId: business.id } });
  if (!slot) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (membership.role !== "owner" && slot.instructorMembershipId !== membership.id) {
    return NextResponse.json({ error: "You can only view your own group lessons" }, { status: 403 });
  }

  const bookings = await prisma.booking.findMany({
    where: { availabilityId: slot.id, status: { not: "cancelled" } },
    include: { player: { select: { name: true, email: true } } },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({
    capacity: slot.groupCapacity,
    priceCents: slot.groupPriceCents,
    roster: bookings.map((b) => ({
      bookingId: b.id,
      name: b.contactName || b.player.name || b.player.email,
      phone: b.contactPhone,
      email: b.contactEmail || b.player.email,
      joinedAt: b.createdAt,
    })),
  });
}
