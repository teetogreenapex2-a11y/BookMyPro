import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug, getMembership } from "@/lib/tenant";

// POST /api/{slug}/durations/{id}/packages  { lessonsCount, priceCents }
// Adds a package size (e.g. a 5-pack) nested under this one duration.
export async function POST(req: NextRequest, { params }: { params: { slug: string; id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const duration = await prisma.lessonDuration.findFirst({
    where: { id: params.id, membership: { businessId: business.id } },
  });
  if (!duration) return NextResponse.json({ error: "Duration not found" }, { status: 404 });

  const requesterMembership = await getMembership((session.user as any).id, business.id);
  const isOwner = requesterMembership?.role === "owner";
  const isSelf = requesterMembership?.id === duration.membershipId;
  if (!isOwner && !isSelf) {
    return NextResponse.json({ error: "You can only edit your own pricing" }, { status: 403 });
  }

  const { lessonsCount, priceCents } = await req.json();
  if (!Number.isInteger(lessonsCount) || lessonsCount < 2) {
    return NextResponse.json({ error: "A package needs at least 2 lessons - a single lesson is already covered by the duration's own price" }, { status: 400 });
  }
  if (!Number.isInteger(priceCents) || priceCents < 0) {
    return NextResponse.json({ error: "Enter a valid price" }, { status: 400 });
  }

  const highestSort = await prisma.lessonPackageOption.findFirst({
    where: { durationId: params.id },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  const created = await prisma.lessonPackageOption.create({
    data: {
      durationId: params.id,
      lessonsCount,
      priceCents,
      sortOrder: (highestSort?.sortOrder ?? -1) + 1,
    },
  });

  return NextResponse.json(created, { status: 201 });
}
