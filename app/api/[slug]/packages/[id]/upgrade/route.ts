import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug, requireMembership, getInstructorById } from "@/lib/tenant";
import { findPackage, getPackagePriceCents, isPackageEnabled } from "@/lib/pricing";

// POST /api/{slug}/packages/{id}/upgrade  { newType: "three" | "five" | "ten" }
// Owner/instructor only. Converts an existing package (typically a single
// lesson) into a bigger one, crediting what the player already paid toward
// the new package's price. The old package is closed out (no further
// lessons can be drawn from it) and a new one is created in its place.
//
// If the credit fully covers the new price, the new package is immediately
// "paid". Otherwise it's "pending" — same status pay-at-first-lesson
// packages use — so the instructor collects the difference and marks it
// paid from the Customers page once they do.
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

  // Scoped by businessId so a package id from a different business can never match here.
  const oldPkg = await prisma.package.findFirst({ where: { id: params.id, businessId: business.id } });
  if (!oldPkg) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { newType } = await req.json();
  const newTier = findPackage(newType);
  if (!newTier) return NextResponse.json({ error: "Unknown package type" }, { status: 400 });

  // A package is tied to a specific instructor's rates — an upgrade stays
  // with that same instructor, priced at their rate for the bigger tier.
  const instructorMembership = oldPkg.instructorMembershipId
    ? await getInstructorById(business.id, oldPkg.instructorMembershipId)
    : null;
  if (!instructorMembership) {
    return NextResponse.json({ error: "Can't determine which instructor's pricing to use for this upgrade" }, { status: 400 });
  }
  if (!isPackageEnabled(instructorMembership, newTier.id)) {
    return NextResponse.json({ error: "That package isn't currently offered by this instructor" }, { status: 400 });
  }
  if (newTier.lessons <= oldPkg.lessonsTotal) {
    return NextResponse.json({ error: "Choose a bigger package to upgrade to" }, { status: 400 });
  }

  const newPriceCents = getPackagePriceCents(instructorMembership, newTier.id);
  const creditCents = Math.min(oldPkg.pricePaidCents, newPriceCents); // never credit more than the new package costs
  const amountDueCents = newPriceCents - creditCents;

  const [, created] = await prisma.$transaction([
    // Close out the old package so it can't be drawn from or upgraded again.
    prisma.package.update({ where: { id: oldPkg.id }, data: { lessonsRemaining: 0 } }),
    prisma.package.create({
      data: {
        businessId: business.id,
        userId: oldPkg.userId,
        instructorMembershipId: oldPkg.instructorMembershipId,
        type: newTier.id,
        lessonsTotal: newTier.lessons,
        lessonsRemaining: newTier.lessons,
        pricePaidCents: newPriceCents,
        creditCents,
        upgradedFromId: oldPkg.id,
        paymentStatus: amountDueCents === 0 ? "paid" : "pending",
        paidAt: amountDueCents === 0 ? new Date() : null,
      },
    }),
  ]);

  return NextResponse.json({ ...created, amountDueCents }, { status: 201 });
}
