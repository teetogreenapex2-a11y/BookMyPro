import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug, getMembership } from "@/lib/tenant";

// PATCH /api/{slug}/instructors/{id}  { specialty }
// Profile-level fields (as opposed to pricing, handled by the sibling
// /pricing route) — currently just specialty, the short tagline shown to
// players when choosing who to book with. Same permission shape as
// pricing: the owner can edit anyone's, an instructor can edit their own.
export async function PATCH(req: NextRequest, { params }: { params: { slug: string; id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const requesterMembership = await getMembership((session.user as any).id, business.id);
  const isOwner = requesterMembership?.role === "owner";
  const isSelf = requesterMembership?.id === params.id;
  if (!isOwner && !isSelf) {
    return NextResponse.json({ error: "You can only edit your own profile" }, { status: 403 });
  }

  // Scoped by businessId so an id from a different business can never match here.
  const target = await prisma.membership.findFirst({
    where: { id: params.id, businessId: business.id, role: { in: ["owner", "instructor"] } },
  });
  if (!target) return NextResponse.json({ error: "Instructor not found" }, { status: 404 });

  const { specialty } = await req.json();
  const updated = await prisma.membership.update({
    where: { id: target.id },
    data: { specialty: typeof specialty === "string" ? specialty.slice(0, 120) : target.specialty },
  });
  return NextResponse.json(updated);
}
