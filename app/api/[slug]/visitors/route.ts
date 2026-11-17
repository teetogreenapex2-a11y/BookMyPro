import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug, getMembership } from "@/lib/tenant";

// GET /api/{slug}/visitors - the owner's list of recent website visits.
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });
  const membership = await getMembership((session.user as any).id, business.id);
  if (!membership || membership.role !== "owner") {
    return NextResponse.json({ error: "Owner access required" }, { status: 403 });
  }

  const days = Math.min(30, Math.max(1, parseInt(req.nextUrl.searchParams.get("days") || "7", 10) || 7));
  const since = new Date(Date.now() - days * 86400000);
  const rows = await prisma.siteVisit.findMany({
    where: { businessId: business.id, lastSeenAt: { gte: since } },
    orderBy: { lastSeenAt: "desc" },
    take: 200,
  });
  return NextResponse.json({
    now: new Date().toISOString(),
    visits: rows.map((r) => ({
      id: r.id, source: r.source, city: r.city, region: r.region, country: r.country,
      referrer: r.referrer, pages: r.pages, startedAt: r.startedAt, lastSeenAt: r.lastSeenAt,
    })),
  });
}
