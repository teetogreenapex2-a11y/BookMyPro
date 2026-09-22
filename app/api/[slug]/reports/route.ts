import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug, getMembership, getBusinessInstructors } from "@/lib/tenant";

// GET /api/{slug}/reports
//
// Daily (today), monthly (this calendar month), and year-to-date figures,
// broken down per instructor plus business-wide totals. Owner sees every
// instructor; a plain instructor only ever sees their own row and totals
// scoped to just their own work - never a business-wide figure that
// includes numbers they aren't supposed to see.
//
// Revenue accounting, worth being explicit about:
// - Booking.priceCents is 0 for any booking that came from a package
//   purchase (the package already recorded that money) - summing both
//   fields as-is never double-counts, by the data model's own design.
// - Package.pricePaidCents reflects actual cash received, including a
//   deposit-only package where the remaining half hasn't been paid yet -
//   this is genuinely cash-basis reporting, not a promise of future money.
// - A gift card's sale is counted as revenue once, at purchase. When it's
//   later redeemed against a shop order, only the order's own
//   uncovered amount (totalCents - giftCardAppliedCents) counts as new
//   revenue - the covered portion was already counted once, at the
//   original gift card sale.
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const membership = await getMembership((session.user as any).id, business.id);
  if (!membership || (membership.role !== "owner" && membership.role !== "instructor")) {
    return NextResponse.json({ error: "Instructor access required" }, { status: 403 });
  }
  const isOwner = membership.role === "owner";

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfYear = new Date(now.getFullYear(), 0, 1);

  const instructors = await getBusinessInstructors(business.id);
  // A plain instructor only ever computes their own figures - never even
  // queries anyone else's, rather than fetching everything and hiding it
  // client-side.
  const scopedInstructors = isOwner ? instructors : instructors.filter((i) => i.id === membership.id);

  async function figuresFor(periodStart: Date) {
    const [bookingRows, packageRows, giftCardAgg, orderAgg] = await Promise.all([
      prisma.booking.groupBy({
        by: ["instructorMembershipId"],
        where: { businessId: business.id, status: "confirmed", createdAt: { gte: periodStart } },
        _sum: { priceCents: true },
        _count: true,
      }),
      prisma.package.groupBy({
        by: ["instructorMembershipId"],
        where: { businessId: business.id, paymentStatus: { in: ["paid", "deposit_paid"] }, createdAt: { gte: periodStart } },
        _sum: { pricePaidCents: true },
        _count: true,
      }),
      // Business-wide only - neither a gift card sale nor a shop order is
      // tied to a specific instructor's own work at all.
      isOwner
        ? prisma.giftCard.aggregate({
            where: { businessId: business.id, createdAt: { gte: periodStart } },
            _sum: { initialValueCents: true },
            _count: true,
          })
        : null,
      isOwner
        ? prisma.order.aggregate({
            where: { businessId: business.id, status: { in: ["paid", "fulfilled"] }, createdAt: { gte: periodStart } },
            _sum: { totalCents: true, giftCardAppliedCents: true },
            _count: true,
          })
        : null,
    ]);

    const byInstructor: Record<string, { revenueCents: number; count: number }> = {};
    for (const row of bookingRows) {
      if (!row.instructorMembershipId) continue;
      const entry = (byInstructor[row.instructorMembershipId] ||= { revenueCents: 0, count: 0 });
      entry.revenueCents += row._sum.priceCents || 0;
      entry.count += row._count;
    }
    for (const row of packageRows) {
      if (!row.instructorMembershipId) continue;
      const entry = (byInstructor[row.instructorMembershipId] ||= { revenueCents: 0, count: 0 });
      entry.revenueCents += row._sum.pricePaidCents || 0;
      entry.count += row._count;
    }

    const instructorFigures = scopedInstructors.map((i) => ({
      instructorMembershipId: i.id,
      name: i.user.name || i.user.email,
      revenueCents: byInstructor[i.id]?.revenueCents || 0,
      count: byInstructor[i.id]?.count || 0,
    }));

    const lessonRevenueCents = instructorFigures.reduce((sum, i) => sum + i.revenueCents, 0);
    const lessonCount = instructorFigures.reduce((sum, i) => sum + i.count, 0);
    const giftCardRevenueCents = giftCardAgg?._sum.initialValueCents || 0;
    // Only the uncovered portion of an order counts as new revenue here -
    // the gift-card-covered part was already counted once, at that gift
    // card's own original sale.
    const shopRevenueCents = orderAgg
      ? (orderAgg._sum.totalCents || 0) - (orderAgg._sum.giftCardAppliedCents || 0)
      : 0;

    return {
      byInstructor: instructorFigures,
      totals: {
        lessonRevenueCents,
        lessonCount,
        giftCardRevenueCents: isOwner ? giftCardRevenueCents : null,
        giftCardCount: isOwner ? giftCardAgg?._count || 0 : null,
        shopRevenueCents: isOwner ? shopRevenueCents : null,
        shopOrderCount: isOwner ? orderAgg?._count || 0 : null,
        combinedRevenueCents: isOwner ? lessonRevenueCents + giftCardRevenueCents + shopRevenueCents : lessonRevenueCents,
      },
    };
  }

  const [daily, monthly, ytd] = await Promise.all([
    figuresFor(startOfDay),
    figuresFor(startOfMonth),
    figuresFor(startOfYear),
  ]);

  return NextResponse.json({ daily, monthly, ytd });
}
