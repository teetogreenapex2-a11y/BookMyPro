import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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
    include: { memberships: { where: { role: "owner" }, include: { user: { select: { name: true, email: true } } } } },
  });

  return NextResponse.json(
    pending.map((b) => ({
      id: b.id,
      slug: b.slug,
      name: b.name,
      ownerName: b.memberships[0]?.user.name || null,
      ownerEmail: b.memberships[0]?.user.email || null,
    }))
  );
}

export async function isPlatformAdmin(userId: string) {
  const adminBusiness = await prisma.business.findUnique({ where: { slug: "tee-to-green-golf" } });
  if (!adminBusiness) return false;
  const membership = await prisma.membership.findUnique({
    where: { userId_businessId: { userId, businessId: adminBusiness.id } },
  });
  return membership?.role === "owner" && membership.status === "active";
}
