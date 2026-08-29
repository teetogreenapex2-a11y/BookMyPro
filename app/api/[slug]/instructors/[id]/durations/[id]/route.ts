import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug, getMembership } from "@/lib/tenant";

async function authorize(req: NextRequest, slug: string, durationId: string) {
  const session = await getServerSession(authOptions);
  if (!session) return { error: NextResponse.json({ error: "Sign in required" }, { status: 401 }) };

  const business = await getBusinessBySlug(slug);
  if (!business) return { error: NextResponse.json({ error: "Business not found" }, { status: 404 }) };

  const duration = await prisma.lessonDuration.findFirst({
    where: { id: durationId, membership: { businessId: business.id } },
    include: { membership: true },
  });
  if (!duration) return { error: NextResponse.json({ error: "Duration not found" }, { status: 404 }) };

  const requesterMembership = await getMembership((session.user as any).id, business.id);
  const isOwner = requesterMembership?.role === "owner";
  const isSelf = requesterMembership?.id === duration.membershipId;
  if (!isOwner && !isSelf) {
    return { error: NextResponse.json({ error: "You can only edit your own pricing" }, { status: 403 }) };
  }

  return { duration };
}

// PATCH /api/{slug}/durations/{id}  { minutes?, singlePriceCents?, remoteEnabled?, sortOrder? }
export async function PATCH(req: NextRequest, { params }: { params: { slug: string; id: string } }) {
  const auth = await authorize(req, params.slug, params.id);
  if (auth.error) return auth.error;

  const { minutes, singlePriceCents, remoteEnabled, sortOrder } = await req.json();
  const data: Record<string, unknown> = {};
  if (minutes !== undefined) {
    if (!Number.isInteger(minutes) || minutes <= 0) return NextResponse.json({ error: "Enter a valid number of minutes" }, { status: 400 });
    data.minutes = minutes;
  }
  if (singlePriceCents !== undefined) {
    if (!Number.isInteger(singlePriceCents) || singlePriceCents < 0) return NextResponse.json({ error: "Enter a valid price" }, { status: 400 });
    data.singlePriceCents = singlePriceCents;
  }
  if (remoteEnabled !== undefined) data.remoteEnabled = !!remoteEnabled;
  if (sortOrder !== undefined) data.sortOrder = sortOrder;

  const updated = await prisma.lessonDuration.update({
    where: { id: params.id },
    data,
    include: { packages: { orderBy: { sortOrder: "asc" } } },
  });

  return NextResponse.json(updated);
}

// DELETE /api/{slug}/durations/{id}
// Cascades to remove its package options too (see onDelete: Cascade on
// LessonPackageOption) - a duration with no packages left over dangling
// would just be confusing clutter in the instructor's own settings.
export async function DELETE(req: NextRequest, { params }: { params: { slug: string; id: string } }) {
  const auth = await authorize(req, params.slug, params.id);
  if (auth.error) return auth.error;

  await prisma.lessonDuration.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}
