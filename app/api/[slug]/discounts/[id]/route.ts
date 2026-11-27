import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug, getMembership } from "@/lib/tenant";

async function load(slug: string, id: string) {
  const session = await getServerSession(authOptions);
  if (!session) return { error: NextResponse.json({ error: "Sign in required" }, { status: 401 }) } as const;
  const business = await getBusinessBySlug(slug);
  if (!business) return { error: NextResponse.json({ error: "Business not found" }, { status: 404 }) } as const;
  const me = await getMembership((session.user as any).id, business.id);
  if (!me || (me.role !== "owner" && me.role !== "instructor")) return { error: NextResponse.json({ error: "Not allowed" }, { status: 403 }) } as const;
  const row = await prisma.discountCode.findFirst({ where: { id, businessId: business.id } });
  if (!row) return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) } as const;
  if (me.role !== "owner" && row.instructorMembershipId !== me.id) return { error: NextResponse.json({ error: "Not allowed" }, { status: 403 }) } as const;
  return { row } as const;
}

// PATCH { active } turns a code on or off.
export async function PATCH(req: NextRequest, { params }: { params: { slug: string; id: string } }) {
  const l = await load(params.slug, params.id);
  if ("error" in l) return l.error;
  const { active } = await req.json();
  await prisma.discountCode.update({ where: { id: l.row.id }, data: { active: !!active } });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: { slug: string; id: string } }) {
  const l = await load(params.slug, params.id);
  if ("error" in l) return l.error;
  await prisma.discountRedemption.deleteMany({ where: { discountCodeId: l.row.id } });
  await prisma.discountCode.delete({ where: { id: l.row.id } });
  return NextResponse.json({ ok: true });
}
