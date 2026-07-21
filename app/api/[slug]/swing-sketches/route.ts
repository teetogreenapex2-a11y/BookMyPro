import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug, getMembership, requireMembership } from "@/lib/tenant";
import { uploadSketchImage } from "@/lib/sketchStorage";

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
  const isStaff = membership?.role === "owner" || membership?.role === "instructor";

  const playerIdFilter = req.nextUrl.searchParams.get("playerId");

  const sketches = await prisma.swingSketch.findMany({
    where: isStaff
      ? {
          businessId: business.id,
          ...(membership!.role === "instructor" ? { instructorMembershipId: membership!.id } : {}),
          ...(playerIdFilter ? { playerId: playerIdFilter } : {}),
        }
      : { businessId: business.id, playerId: userId },
    include: {
      player: { select: { name: true, email: true } },
      instructor: { include: { user: { select: { name: true } } } },
      booking: { select: { startTime: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  const shaped = sketches.map((s) => ({
    id: s.id,
    imageUrl: s.imageUrl,
    sourceUrl: s.sourceUrl,
    label: s.label,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    playerName: s.player.name || s.player.email,
    playerId: s.playerId,
    instructorName: s.instructor.user.name,
    bookingStartTime: s.booking?.startTime || null,
  }));

  return NextResponse.json(shaped);
}

// POST /api/{slug}/swing-sketches — multipart form:
// image (flattened annotated PNG, required), source (original photo, optional),
// shapesJson (required, so it stays re-editable), playerId (required),
// bookingId?, label?
// Only an instructor/owner can create one — this is instructor-authored,
// not something a player submits themselves (that's swing video review).
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const membership = await requireMembership((session.user as any).id, business.id, ["owner", "instructor"]);
  if (!membership) return NextResponse.json({ error: "Instructor access required" }, { status: 403 });

  const form = await req.formData();
  const imageFile = form.get("image");
  const sourceFile = form.get("source");
  const shapesJson = form.get("shapesJson")?.toString();
  const playerId = form.get("playerId")?.toString();
  const bookingId = form.get("bookingId")?.toString() || null;
  const label = form.get("label")?.toString() || null;

  if (!(imageFile instanceof File)) {
    return NextResponse.json({ error: "No annotated image was included" }, { status: 400 });
  }
  if (!shapesJson) {
    return NextResponse.json({ error: "Missing drawing data" }, { status: 400 });
  }
  if (!playerId) {
    return NextResponse.json({ error: "Choose which player this is for" }, { status: 400 });
  }
  const player = await prisma.user.findFirst({
    where: { id: playerId, memberships: { some: { businessId: business.id } } },
  });
  if (!player) {
    return NextResponse.json({ error: "That player isn't part of this business" }, { status: 400 });
  }

  const uploadedImage = await uploadSketchImage(imageFile, business.id, "annotated");
  if ("error" in uploadedImage) {
    return NextResponse.json({ error: uploadedImage.error }, { status: 400 });
  }

  let sourceUrl: string | null = null;
  if (sourceFile instanceof File) {
    const uploadedSource = await uploadSketchImage(sourceFile, business.id, "source");
    if (!("error" in uploadedSource)) sourceUrl = uploadedSource.url;
  }

  const sketch = await prisma.swingSketch.create({
    data: {
      businessId: business.id,
      playerId,
      instructorMembershipId: membership.id,
      bookingId,
      imageUrl: uploadedImage.url,
      sourceUrl,
      shapesJson,
      label,
    },
  });

  return NextResponse.json(sketch, { status: 201 });
}
