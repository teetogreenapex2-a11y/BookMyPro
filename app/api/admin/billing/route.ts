import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isPlatformAdmin } from "@/lib/tenant";

// GET /api/admin/billing
// Every approved business, with enough of their own billing state to
// decide who still needs a subscription set up.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const isAdmin = await isPlatformAdmin((session.user as any).id);
  if (!isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const businesses = await prisma.business.findMany({
    where: { approved: true },
    include: {
      memberships: { where: { role: "owner" }, include: { user: { select: { name: true, email: true } } } },
      _count: { select: { memberships: { where: { role: "instructor", status: "active" } } } },
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(
    businesses.map((b) => ({
      id: b.id,
      slug: b.slug,
      name: b.name,
      email: b.email,
      subscriptionStatus: b.subscriptionStatus,
      ownerName: b.memberships[0]?.user.name || null,
      ownerEmail: b.memberships[0]?.user.email || null,
      // Instructors only (not the owner themselves) - matches how the
      // per-instructor charge should actually be counted, since the
      // owner's own seat is already covered by the base fee.
      instructorCount: b._count.memberships,
    }))
  );
}
