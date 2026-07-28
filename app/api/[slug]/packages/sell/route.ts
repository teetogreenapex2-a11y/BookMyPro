import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug, requireMembership, getMembership, getInstructorById } from "@/lib/tenant";
import { findPackage, getPackagePriceCents } from "@/lib/pricing";

// POST /api/{slug}/packages/sell  { playerId, packageType, instructorMembershipId, markAsPaid }
//
// For selling a package with no specific lesson booked yet - a customer
// who wants to buy in now and schedule their actual sessions later,
// rather than picking a time in the same motion (see the manual booking
// route for that combined version). Instructor/owner only, unlike the
// player-facing pay-later route, since this is the instructor initiating
// the sale directly rather than a business-wide self-serve setting.
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const membership = await requireMembership((session.user as any).id, business.id, ["owner", "instructor"]);
  if (!membership) return NextResponse.json({ error: "Instructor access required" }, { status: 403 });

  const { playerId, packageType, instructorMembershipId, markAsPaid } = await req.json();

  if (!playerId) return NextResponse.json({ error: "Choose which player this is for" }, { status: 400 });
  const playerMembership = await getMembership(playerId, business.id);
  if (!playerMembership || playerMembership.role !== "player") {
    return NextResponse.json({ error: "That player isn't part of this business" }, { status: 400 });
  }

  const packageDef = findPackage(packageType);
  if (!packageDef) return NextResponse.json({ error: "Unknown package type" }, { status: 400 });

  if (!instructorMembershipId) return NextResponse.json({ error: "Choose which instructor this is for" }, { status: 400 });
  const instructorMembership = await getInstructorById(business.id, instructorMembershipId);
  if (!instructorMembership) return NextResponse.json({ error: "That instructor isn't available at this business" }, { status: 400 });

  const created = await prisma.package.create({
    data: {
      businessId: business.id,
      userId: playerId,
      instructorMembershipId,
      type: packageType,
      lessonsTotal: packageDef.lessons,
      lessonsRemaining: packageDef.lessons,
      pricePaidCents: getPackagePriceCents(instructorMembership, packageType),
      paymentStatus: markAsPaid === false ? "pending" : "paid",
      paidAt: markAsPaid === false ? null : new Date(),
    },
  });

  return NextResponse.json(created, { status: 201 });
}
