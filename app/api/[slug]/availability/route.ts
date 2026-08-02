import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug, requireMembership, getMembership } from "@/lib/tenant";
import { sendPushToMembership } from "@/lib/pushNotifications";
import { businessDestination } from "@/lib/businessUrl";

// POST /api/{slug}/availability/{id}/cancel-group
// Instructor/owner only - cancels an entire group lesson session at once,
// as opposed to the regular booking cancel route, which only ever handles
// one booking on one private-lesson slot. Deliberately does NOT refund
// automatically - a cancellation (e.g. weather) is often actually a
// reschedule in practice, not a true refund situation, so that decision
// is left to the instructor to handle directly with players rather than
// assumed here. Marks every booking on this slot cancelled, notifies each
// player, and resets the slot back to a plain, normal open slot.
export async function POST(req: NextRequest, { params }: { params: { slug: string; id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const membership = await requireMembership((session.user as any).id, business.id, ["owner", "instructor"]);
  if (!membership) return NextResponse.json({ error: "Instructor access required" }, { status: 403 });

  const slot = await prisma.availability.findFirst({ where: { id: params.id, businessId: business.id } });
  if (!slot) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!slot.isGroup) return NextResponse.json({ error: "This isn't a group lesson" }, { status: 400 });
  if (membership.role !== "owner" && slot.instructorMembershipId !== membership.id) {
    return NextResponse.json({ error: "You can only cancel your own group lessons" }, { status: 403 });
  }

  const bookings = await prisma.booking.findMany({
    where: { availabilityId: slot.id, status: { not: "cancelled" } },
  });

  for (const booking of bookings) {
    const playerMembership = await getMembership(booking.playerId, business.id);
    if (playerMembership) {
      await sendPushToMembership(playerMembership.id, {
        title: "Group lesson cancelled",
        body: `Your group lesson on ${slot.startTime.toLocaleDateString()} has been cancelled. Contact your instructor for details on rescheduling or a refund.`,
        url: businessDestination(business.slug, "/book"),
      });
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.booking.updateMany({
      where: { availabilityId: slot.id, status: { not: "cancelled" } },
      data: { status: "cancelled" },
    });
    await tx.availability.update({
      where: { id: slot.id },
      data: {
        status: "open",
        isGroup: false,
        groupCapacity: null,
        groupPriceCents: null,
        groupCategory: null,
        groupAgeRange: null,
      },
    });
  });

  return NextResponse.json({ cancelled: true, playersAffected: bookings.length });
}
