import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isPlatformAdmin } from "@/lib/tenant";

// GET /api/admin/expiring-trials
// Every business whose 30-day trial has genuinely passed and hasn't
// subscribed - this is what the admin sees to actually decide each
// one's fate, rather than anything happening automatically on its own.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const isAdmin = await isPlatformAdmin((session.user as any).id);
  if (!isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const businesses = await prisma.business.findMany({
    where: { subscriptionStatus: "trial", trialEndsAt: { lt: new Date() } },
    include: { memberships: { where: { role: "owner" }, include: { user: { select: { name: true, email: true } } } } },
    orderBy: { trialEndsAt: "asc" },
  });

  return NextResponse.json(
    businesses.map((b) => ({
      id: b.id,
      slug: b.slug,
      name: b.name,
      trialEndsAt: b.trialEndsAt,
      ownerName: b.memberships[0]?.user.name || null,
      ownerEmail: b.memberships[0]?.user.email || null,
    }))
  );
}
