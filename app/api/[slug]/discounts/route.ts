import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug, getMembership } from "@/lib/tenant";
import { normalizeCode } from "@/lib/discounts";

async function who(slug: string) {
  const session = await getServerSession(authOptions);
  if (!session) return { error: NextResponse.json({ error: "Sign in required" }, { status: 401 }) } as const;
  const business = await getBusinessBySlug(slug);
  if (!business) return { error: NextResponse.json({ error: "Business not found" }, { status: 404 }) } as const;
  const me = await getMembership((session.user as any).id, business.id);
  if (!me || (me.role !== "owner" && me.role !== "instructor")) return { error: NextResponse.json({ error: "Not allowed" }, { status: 403 }) } as const;
  return { business, me } as const;
}

// GET /api/{slug}/discounts -> { codes, instructors, isOwner }
// The owner sees every code. An instructor sees only their own.
export async function GET(_req: NextRequest, { params }: { params: { slug: string } }) {
  const w = await who(params.slug);
  if ("error" in w) return w.error;
  const isOwner = w.me.role === "owner";
  const rows = await prisma.discountCode.findMany({
    where: { businessId: w.business.id, ...(isOwner ? {} : { instructorMembershipId: w.me.id }) },
    orderBy: { createdAt: "desc" },
  });
  const staff = await prisma.membership.findMany({
    where: { businessId: w.business.id, role: { in: ["owner", "instructor"] }, status: "active" },
    include: { user: { select: { name: true } } },
  });
  const counts = await prisma.discountRedemption.groupBy({ by: ["discountCodeId"], where: { businessId: w.business.id }, _count: { _all: true } });
  const usedBy = new Map(counts.map((c) => [c.discountCodeId, c._count._all]));
  const nameOf = new Map(staff.map((s) => [s.id, s.user?.name || "Instructor"]));
  return NextResponse.json({
    isOwner,
    instructors: isOwner ? staff.map((s) => ({ id: s.id, name: s.user?.name || "Instructor" })) : [],
    codes: rows.map((r) => ({
      id: r.id, code: r.code, kind: r.kind, value: r.value, appliesTo: r.appliesTo, active: r.active,
      instructorMembershipId: r.instructorMembershipId, instructorName: r.instructorMembershipId ? nameOf.get(r.instructorMembershipId) || "Instructor" : null,
      used: usedBy.get(r.id) || 0,
      expiresAt: r.expiresAt ? r.expiresAt.toISOString() : null, createdAt: r.createdAt.toISOString(),
    })),
  });
}

// POST /api/{slug}/discounts { code, kind, value, appliesTo, instructorMembershipId?, expiresOn? }
// kind "percent": value is 1-99. kind "amount": value is cents.
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const w = await who(params.slug);
  if ("error" in w) return w.error;
  const body = await req.json();
  const code = normalizeCode(body.code);
  if (!/^[A-Z0-9_-]{3,24}$/.test(code)) return NextResponse.json({ error: "Codes are 3-24 letters or numbers, like SPRING20" }, { status: 400 });
  const kind = body.kind === "amount" ? "amount" : "percent";
  const value = Math.round(Number(body.value));
  if (!Number.isFinite(value) || value < 1) return NextResponse.json({ error: "Enter how much the discount is" }, { status: 400 });
  if (kind === "percent" && value > 99) return NextResponse.json({ error: "Percent must be between 1 and 99" }, { status: 400 });
  if (kind === "amount" && value > 100000) return NextResponse.json({ error: "That dollar amount is too large" }, { status: 400 });
  const appliesTo = ["lessons", "fittings"].includes(body.appliesTo) ? body.appliesTo : "all";

  // Instructors can only make codes for their own lessons and fittings.
  let instructorMembershipId: string | null = null;
  if (w.me.role !== "owner") instructorMembershipId = w.me.id;
  else if (body.instructorMembershipId) {
    const target = await prisma.membership.findFirst({ where: { id: String(body.instructorMembershipId), businessId: w.business.id, role: { in: ["owner", "instructor"] } } });
    if (!target) return NextResponse.json({ error: "Pick a valid instructor" }, { status: 400 });
    instructorMembershipId = target.id;
  }

  let expiresAt: Date | null = null;
  if (body.expiresOn) {
    // Valid through the end of that day in US time (about 6am UTC the next day).
    const t = Date.parse(`${String(body.expiresOn).slice(0, 10)}T23:59:59Z`);
    if (!Number.isFinite(t)) return NextResponse.json({ error: "That end date isn't valid" }, { status: 400 });
    expiresAt = new Date(t + 6 * 3600 * 1000);
  }

  const existing = await prisma.discountCode.findFirst({ where: { businessId: w.business.id, code } });
  if (existing) return NextResponse.json({ error: "You already have a code with that name" }, { status: 409 });

  const row = await prisma.discountCode.create({
    data: { businessId: w.business.id, code, kind, value, appliesTo, instructorMembershipId, expiresAt },
  });
  return NextResponse.json({ id: row.id });
}
