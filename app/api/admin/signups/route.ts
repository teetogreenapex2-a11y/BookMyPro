import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isPlatformAdmin } from "@/lib/tenant";

// GET /api/admin/signups - newest accounts first, with how they signed in and
// which business (if any) they belong to. Platform owner only.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (!(await isPlatformAdmin((session.user as any).id))) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true, name: true, email: true, createdAt: true,
      accounts: { select: { provider: true } },
      memberships: { where: { status: "active" }, select: { role: true, business: { select: { name: true } } } },
    },
  });
  return NextResponse.json(users.map((u) => ({
    id: u.id, name: u.name, email: u.email, createdAt: u.createdAt.toISOString(),
    via: Array.from(new Set(u.accounts.map((a) => a.provider))).join(", ") || "email link",
    businesses: u.memberships.map((m) => `${m.business.name} (${m.role})`),
  })));
}
