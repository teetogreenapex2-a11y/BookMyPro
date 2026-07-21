import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug, ensureMembership, getInstructorById } from "@/lib/tenant";
import { findPackage, getPackagePriceCents, isPackageEnabled, isPackagePriceSet } from "@/lib/pricing";

// POST /api/{slug}/packages/pay-later  { packageType }
// Creates a Package immediately with paymentStatus "pending" — no Stripe
// checkout involved. The business collects payment in person and marks it
// paid later (see PATCH /api/{slug}/packages/[id]). Only usable if the
// business has explicitly turned this on in Settings.
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  if (!business.allowPayLater) {
    return NextResponse.json({ error: "This business doesn't offer pay-at-first-lesson" }, { status: 400 });
  }

  const { packageType, instructorMembershipId } = await req.json();
  const pkg = findPackage(packageType);
  if (!pkg) return NextResponse.json({ error: "Unknown package type" }, { status: 400 });
  if (pkg.id === "video" && !business.dailyApiKey) {
    return NextResponse.json({ error: "This business hasn't set up remote lessons yet" }, { status: 400 });
  }

  // Pricing is per-instructor now — a package is "N lessons with this
  // specific person," not a generic credit any instructor can redeem.
  if (!instructorMembershipId) {
    return NextResponse.json({ error: "Choose which instructor you're booking with" }, { status: 400 });
  }
  const instructorMembership = await getInstructorById(business.id, instructorMembershipId);
  if (!instructorMembership) {
    return NextResponse.json({ error: "That instructor isn't available at this business" }, { status: 400 });
  }

  if (!isPackageEnabled(instructorMembership, pkg.id)) {
    return NextResponse.json({ error: "This package isn't currently offered by this instructor" }, { status: 400 });
  }
  if (!isPackagePriceSet(instructorMembership, pkg.id)) {
    return NextResponse.json({ error: "This package doesn't have a price set yet — contact the business" }, { status: 400 });
  }

  const userId = (session.user as any).id;
  await ensureMembership(userId, business.id, "player");

  const created = await prisma.package.create({
    data: {
      businessId: business.id,
      userId,
      instructorMembershipId,
      type: pkg.id,
      lessonsTotal: pkg.lessons,
      lessonsRemaining: pkg.lessons,
      pricePaidCents: getPackagePriceCents(instructorMembership, pkg.id),
      paymentStatus: "pending",
    },
  });

  return NextResponse.json(created, { status: 201 });
}
