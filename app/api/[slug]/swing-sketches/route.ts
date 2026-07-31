import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug, getMembership, requireMembership } from "@/lib/tenant";
import { sendPushToMembership } from "@/lib/pushNotifications";
import { businessDestination } from "@/lib/businessUrl";

// GET /api/{slug}/swing-sketches?playerId=X — a player sees their own; an
// instructor/owner sees ones they created (owner sees all, matching the
// same pattern as swing video submissions).
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const userId = (session.user as any).id;
  const membership = await getMembership(userId, business.id);
  if (!membership) return NextResponse.json({ error: "Not a member of this business" }, { status: 403 });

  const requestedPlayerId = req.nextUrl.searchParams.get("playerId");
  const isStaff = membership.role === "owner" || membership.role === "instructor";

  const where: Record<string, unknown> = { businessId: business.id };
  if (isStaff) {
    if (requestedPlayerId) where.playerId = requestedPlayerId;
    if (membership.role === "instructor") where.instructorMembershipId = membership.id;
  } else {
    // A player can only ever see their own, regardless of what's asked for.
    where.playerId = userId;
  }

  const sketches = await prisma.swingSketch.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { player: { select: { name: true, email: true } } },
  });

  return NextResponse.json(
    sketches.map((s) => ({
      id: s.id,
      imageUrl: s.imageUrl,
      sourceUrl: s.sourceUrl,
      label: s.label,
      createdAt: s.createdAt,
      playerName: s.player.name || s.player.email,
      bookingId: s.bookingId,
    }))
  );
}

// POST /api/{slug}/swing-sketches  { playerId, imageUrl, sourceUrl?, shapesJson, label?, bookingId? }
// Instructor/owner only - saves a finished, annotated sketch for a player.
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const membership = await requireMembership((session.user as any).id, business.id, ["owner", "instructor"]);
  if (!membership) return NextResponse.json({ error: "Instructor access required" }, { status: 403 });

  const { playerId, imageUrl, sourceUrl, shapesJson, label, bookingId } = await req.json();
  if (!playerId) return NextResponse.json({ error: "Choose which player this is for" }, { status: 400 });
  if (!imageUrl) return NextResponse.json({ error: "Missing the sketch image" }, { status: 400 });

  const playerMembership = await getMembership(playerId, business.id);
  if (!playerMembership || playerMembership.role !== "player") {
    return NextResponse.json({ error: "That player isn't part of this business" }, { status: 400 });
  }

  const sketch = await prisma.swingSketch.create({
    data: {
      businessId: business.id,
      playerId,
      instructorMembershipId: membership.id,
      bookingId: bookingId || null,
      imageUrl,
      sourceUrl: sourceUrl || null,
      shapesJson: shapesJson || "[]",
      label: label || null,
    },
  });

  await sendPushToMembership(playerMembership.id, {
    title: "New Swing Sketch from your instructor",
    body: label || "Take a look when you get a chance.",
    url: businessDestination(business.slug, "/swing-sketches"),
  });

  return NextResponse.json(sketch, { status: 201 });
}
