import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isPlatformAdmin } from "@/lib/tenant";

async function guard() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (!(await isPlatformAdmin((session.user as any).id))) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  return null;
}

// GET /api/admin/features - every approved business and whether video is on.
export async function GET() {
  const denied = await guard();
  if (denied) return denied;
  const businesses = await prisma.business.findMany({
    where: { approved: true },
    select: { id: true, slug: true, name: true, videoEnabled: true },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(businesses);
}

// PATCH /api/admin/features  { id, videoEnabled }
export async function PATCH(req: NextRequest) {
  const denied = await guard();
  if (denied) return denied;
  const { id, videoEnabled } = await req.json();
  if (typeof id !== "string" || typeof videoEnabled !== "boolean") {
    return NextResponse.json({ error: "id and videoEnabled are required" }, { status: 400 });
  }
  const b = await prisma.business.update({ where: { id }, data: { videoEnabled }, select: { id: true, videoEnabled: true } });
  return NextResponse.json(b);
}
