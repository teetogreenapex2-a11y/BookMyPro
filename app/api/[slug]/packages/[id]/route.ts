import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug, requireMembership } from "@/lib/tenant";

// PATCH /api/{slug}/packages/{id}  { paymentStatus: "paid" }
// Owner/instructor only — used to mark a pay-later package as collected
// once the player actually pays in person.
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

  const { paymentStatus } = await req.json();
  if (paymentStatus !== "paid") {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const updated = await prisma.package.update({
    where: { id: pkg.id },
    data: { paymentStatus: "paid", paidAt: new Date() },
  });

  return NextResponse.json(updated);
}
