import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isPlatformAdmin } from "@/lib/tenant";

// GET /api/admin/pending-businesses — lists every business waiting on
// approval. There's no dedicated platform-admin role yet, so access is
// gated the same practical way as everything else tonight that needed a
// real person to review something: whoever owns the one real, known
// business on the platform right now.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const isAdmin = await isPlatformAdmin((session.user as any).id);
  if (!isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const pending = await prisma.business.findMany({
    where: { approved: false },
    include: { memberships: { where: { role: "owner" }, orderBy: { createdAt: "asc" }, include: { user: { select: { name: true, email: true, createdAt: true } } } } },
  });

  return NextResponse.json(
    pending.sort((a, c) => (c.memberships[0]?.createdAt?.getTime() || 0) - (a.memberships[0]?.createdAt?.getTime() || 0)).map((b) => ({
      id: b.id,
      slug: b.slug,
      name: b.name,
      ownerName: b.memberships[0]?.user.name || null,
      ownerEmail: b.memberships[0]?.user.email || null,
      // The owner membership is created at signup, so this is when the business was requested.
      requestedAt: b.memberships[0]?.createdAt?.toISOString() || null,
      accountCreatedAt: b.memberships[0]?.user.createdAt?.toISOString() || null,
    }))
  );
}
