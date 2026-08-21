import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isPlatformAdmin, getBusinessBySlug } from "@/lib/tenant";

// GET /api/admin/inspect-memberships?slug=tee-to-green-golf
//
// Temporary diagnostic route - lists every membership at a business
// alongside the underlying user's id/email/createdAt, so a
// same-name-but-different-account duplicate is actually visible instead
// of just showing up as an unexplained extra name in the UI. Not linked
// from anywhere; hit it directly. Safe to delete once the current
// duplicate-Rick-Stitzer investigation is resolved.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const isAdmin = await isPlatformAdmin((session.user as any).id);
  if (!isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const slug = req.nextUrl.searchParams.get("slug");
  if (!slug) return NextResponse.json({ error: "Pass ?slug=..." }, { status: 400 });

  const business = await getBusinessBySlug(slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const memberships = await prisma.membership.findMany({
    where: { businessId: business.id },
    include: { user: true },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({
    business: { id: business.id, slug: business.slug },
    memberships: memberships.map((m) => ({
      membershipId: m.id,
      role: m.role,
      status: m.status,
      membershipCreatedAt: m.createdAt,
      googleCalendarConnected: !!m.googleRefreshToken,
      user: {
        userId: m.user.id,
        name: m.user.name,
        email: m.user.email,
      },
    })),
  });
}
