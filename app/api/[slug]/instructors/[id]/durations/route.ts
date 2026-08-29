import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug, getMembership } from "@/lib/tenant";

// GET /api/{slug}/instructors/{id}/durations
// Every lesson duration this instructor offers, each with its package
// options nested inside. No auth required to read - the booking page
// needs this to show what's available before a player is necessarily
// signed in, same reasoning as the main availability route.
export async function GET(req: NextRequest, { params }: { params: { slug: string; id: string } }) {
  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const durations = await prisma.lessonDuration.findMany({
    where: { membershipId: params.id, membership: { businessId: business.id } },
    include: { packages: { orderBy: { sortOrder: "asc" } } },
    orderBy: { sortOrder: "asc" },
  });

  return NextResponse.json(durations);
}

// POST /api/{slug}/instructors/{id}/durations  { minutes, singlePriceCents, remoteEnabled? }
// Owner can add for anyone; an instructor can only add their own - same
// permission split already established for the rest of pricing.
export async function POST(req: NextRequest, { params }: { params: { slug: string; id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const requesterMembership = await getMembership((session.user as any).id, business.id);
  const isOwner = requesterMembership?.role === "owner";
  const isSelf = requesterMembership?.id === params.id;
  if (!isOwner && !isSelf) {
    return NextResponse.json({ error: "You can only edit your own pricing" }, { status: 403 });
  }

  const target = await prisma.membership.findFirst({
    where: { id: params.id, businessId: business.id, role: { in: ["owner", "instructor"] } },
  });
  if (!target) return NextResponse.json({ error: "Instructor not found" }, { status: 404 });

  const { minutes, singlePriceCents, remoteEnabled } = await req.json();
  if (!Number.isInteger(minutes) || minutes <= 0) {
    return NextResponse.json({ error: "Enter a valid number of minutes" }, { status: 400 });
  }
  if (!Number.isInteger(singlePriceCents) || singlePriceCents < 0) {
    return NextResponse.json({ error: "Enter a valid price" }, { status: 400 });
  }

  const highestSort = await prisma.lessonDuration.findFirst({
    where: { membershipId: params.id },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  const created = await prisma.lessonDuration.create({
    data: {
      membershipId: params.id,
      minutes,
      singlePriceCents,
      remoteEnabled: remoteEnabled !== false,
      sortOrder: (highestSort?.sortOrder ?? -1) + 1,
    },
    include: { packages: true },
  });

  return NextResponse.json(created, { status: 201 });
}
