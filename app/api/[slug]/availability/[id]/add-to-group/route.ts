import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug, requireMembership, ensureMembership } from "@/lib/tenant";

// POST /api/{slug}/availability/{id}/add-to-group  { playerId }
//
// Manually adds an existing customer to a group lesson's roster - for a
// spot paid in person, comped, or otherwise handled outside the app's
// own checkout. playerId is the person's user id (the same id the
// customer list itself uses), not a membership id. Follows the same
// booking-creation and fill-to-full pattern the paid checkout path
// already uses when someone joins through Stripe or Square.
export async function POST(req: NextRequest, { params }: { params: { slug: string; id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const membership = await requireMembership((session.user as any).id, business.id, ["owner", "instructor"]);
  if (!membership) return NextResponse.json({ error: "Instructor access required" }, { status: 403 });

  const { playerId } = await req.json();
  if (!playerId) return NextResponse.json({ error: "Pick a player first" }, { status: 400 });

  const slot = await prisma.availability.findFirst({
    where: { id: params.id, businessId: business.id, isGroup: true },
    include: { bookings: { where: { status: { not: "cancelled" } } } },
  });
  if (!slot) return NextResponse.json({ error: "Session not found" }, { status: 404 });
  if (membership.role !== "owner" && slot.instructorMembershipId !== membership.id) {
    return NextResponse.json({ error: "You can only manage your own group lessons" }, { status: 403 });
  }
  if (!slot.groupCapacity || slot.bookings.length >= slot.groupCapacity) {
    return NextResponse.json({ error: "This session is already full" }, { status: 400 });
  }
  if (slot.bookings.some((b) => b.playerId === playerId)) {
    return NextResponse.json({ error: "That player is already on this roster" }, { status: 400 });
  }

  await ensureMembership(playerId, business.id, "player");

  await prisma.$transaction(async (tx) => {
    await tx.booking.create({
      data: {
        businessId: business.id,
        playerId,
        serviceType: "lesson",
        startTime: slot.startTime,
        status: "confirmed",
        priceCents: slot.groupPriceCents ?? 0,
        availabilityId: slot.id,
        instructorMembershipId: slot.instructorMembershipId,
      },
    });

    const newCount = slot.bookings.length + 1;
    if (newCount >= slot.groupCapacity!) {
      await tx.availability.update({ where: { id: slot.id }, data: { status: "full" } });
    }
  });

  return NextResponse.json({ success: true });
}
