import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug, requireMembership } from "@/lib/tenant";

// PATCH /api/{slug}/packages/{id}  { paymentStatus?: "paid", lessonsRemaining?: number }
// Owner/instructor only - marks a pay-later package as collected once
// paid in person, and/or directly adjusts the lesson count for a manual
// correction (a comp'd lesson, a mistake to fix, etc.) rather than only
// ever changing through the normal booking/cancel flow.
export async function PATCH(
  req: NextRequest,
  { params }: { params: { slug: string; id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const membership = await requireMembership((session.user as any).id, business.id, ["owner", "instructor"]);
  if (!membership) return NextResponse.json({ error: "Instructor access required" }, { status: 403 });

  // Scoped by businessId so a package id from a different business can never match here.
  const pkg = await prisma.package.findFirst({ where: { id: params.id, businessId: business.id } });
  if (!pkg) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { paymentStatus, lessonsRemaining } = await req.json();

  const data: Record<string, unknown> = {};

  if (paymentStatus !== undefined) {
    if (paymentStatus !== "paid") return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    data.paymentStatus = "paid";
    data.paidAt = new Date();
    data.balanceDueCents = 0;
  }

  if (lessonsRemaining !== undefined) {
    if (!Number.isInteger(lessonsRemaining) || lessonsRemaining < 0) {
      return NextResponse.json({ error: "Lessons remaining must be a whole number, 0 or more" }, { status: 400 });
    }
    data.lessonsRemaining = lessonsRemaining;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const updated = await prisma.package.update({ where: { id: pkg.id }, data });

  return NextResponse.json(updated);
}
