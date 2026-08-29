import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug, getMembership } from "@/lib/tenant";

async function authorize(req: NextRequest, slug: string, packageOptionId: string) {
  const session = await getServerSession(authOptions);
  if (!session) return { error: NextResponse.json({ error: "Sign in required" }, { status: 401 }) };

  const business = await getBusinessBySlug(slug);
  if (!business) return { error: NextResponse.json({ error: "Business not found" }, { status: 404 }) };

  const option = await prisma.lessonPackageOption.findFirst({
    where: { id: packageOptionId, duration: { membership: { businessId: business.id } } },
    include: { duration: true },
  });
  if (!option) return { error: NextResponse.json({ error: "Package not found" }, { status: 404 }) };

  const requesterMembership = await getMembership((session.user as any).id, business.id);
  const isOwner = requesterMembership?.role === "owner";
  const isSelf = requesterMembership?.id === option.duration.membershipId;
  if (!isOwner && !isSelf) {
    return { error: NextResponse.json({ error: "You can only edit your own pricing" }, { status: 403 }) };
  }

  return { option };
}

// PATCH /api/{slug}/lesson-packages/{id}  { lessonsCount?, priceCents?, sortOrder? }
export async function PATCH(req: NextRequest, { params }: { params: { slug: string; id: string } }) {
  const auth = await authorize(req, params.slug, params.id);
  if (auth.error) return auth.error;

  const { lessonsCount, priceCents, sortOrder } = await req.json();
  const data: Record<string, unknown> = {};
  if (lessonsCount !== undefined) {
    if (!Number.isInteger(lessonsCount) || lessonsCount < 2) return NextResponse.json({ error: "A package needs at least 2 lessons" }, { status: 400 });
    data.lessonsCount = lessonsCount;
  }
  if (priceCents !== undefined) {
    if (!Number.isInteger(priceCents) || priceCents < 0) return NextResponse.json({ error: "Enter a valid price" }, { status: 400 });
    data.priceCents = priceCents;
  }
  if (sortOrder !== undefined) data.sortOrder = sortOrder;

  const updated = await prisma.lessonPackageOption.update({ where: { id: params.id }, data });
  return NextResponse.json(updated);
}

// DELETE /api/{slug}/lesson-packages/{id}
export async function DELETE(req: NextRequest, { params }: { params: { slug: string; id: string } }) {
  const auth = await authorize(req, params.slug, params.id);
  if (auth.error) return auth.error;

  await prisma.lessonPackageOption.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}
