import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug, requireMembership } from "@/lib/tenant";

// POST /api/{slug}/bookings/{id}/deny — owner/instructor only.
// Denies a pending booking: releases the slot, refunds a package credit
// automatically if one was held for a lesson. Does NOT auto-refund a real
// payment (fitting) — that's handled by the instructor outside the app.
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

  const booking = await prisma.booking.findFirst({ where: { id: params.id, businessId: business.id } });
  if (!booking) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (booking.status !== "pending") {
    return NextResponse.json({ error: "This booking isn't pending" }, { status: 400 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.booking.update({ where: { id: booking.id }, data: { status: "denied" } });
    if (booking.availabilityId) {
      await tx.availability.update({ where: { id: booking.availabilityId }, data: { status: "open" } });
    }
    if (booking.packageId) {
      await tx.package.update({ where: { id: booking.packageId }, data: { lessonsRemaining: { increment: 1 } } });
    }
  });

  return NextResponse.json({
    ok: true,
    refundNeeded: booking.priceCents > 0, // a real payment was involved — instructor handles this manually
  });
}
