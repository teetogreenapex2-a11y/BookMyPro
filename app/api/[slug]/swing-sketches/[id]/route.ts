import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug, getMembership } from "@/lib/tenant";
import { uploadSketchImage } from "@/lib/sketchStorage";

// GET /api/{slug}/swing-sketches/{id} — includes shapesJson, so the
// instructor can reopen it and keep editing rather than it being a flat
// image forever.
export async function GET(req: NextRequest, { params }: { params: { slug: string; id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const sketch = await prisma.swingSketch.findFirst({
    where: { id: params.id, businessId: business.id },
    include: { player: { select: { name: true, email: true } }, instructor: { include: { user: { select: { name: true } } } } },
  });
  if (!sketch) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const userId = (session.user as any).id;
  const membership = await getMembership(userId, business.id);
  const isOwner = membership?.role === "owner";
  const isAssignedInstructor = sketch.instructorMembershipId === membership?.id;
  const isSubjectPlayer = sketch.playerId === userId;
  if (!isOwner && !isAssignedInstructor && !isSubjectPlayer) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: sketch.id,
    imageUrl: sketch.imageUrl,
    sourceUrl: sketch.sourceUrl,
    shapesJson: sketch.shapesJson,
    label: sketch.label,
    playerId: sketch.playerId,
    playerName: sketch.player.name || sketch.player.email,
    instructorName: sketch.instructor.user.name,
    createdAt: sketch.createdAt,
    updatedAt: sketch.updatedAt,
  });
}

// PATCH /api/{slug}/swing-sketches/{id} — multipart form, same shape as
// creation: re-saves the flattened image and updated shape data after
// further editing. Only the assigned instructor (or the owner) can edit —
// a player can view their sketch but not change it.
export async function PATCH(req: NextRequest, { params }: { params: { slug: string; id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const sketch = await prisma.swingSketch.findFirst({ where: { id: params.id, businessId: business.id } });
  if (!sketch) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const membership = await getMembership((session.user as any).id, business.id);
  const isOwner = membership?.role === "owner";
  const isAssignedInstructor = sketch.instructorMembershipId === membership?.id;
  if (!isOwner && !isAssignedInstructor) {
    return NextResponse.json({ error: "Only the assigned instructor can edit this" }, { status: 403 });
  }

  const form = await req.formData();
  const imageFile = form.get("image");
  const shapesJson = form.get("shapesJson")?.toString();
  const label = form.get("label")?.toString();

  if (!(imageFile instanceof File) || !shapesJson) {
    return NextResponse.json({ error: "Missing updated image or drawing data" }, { status: 400 });
  }

  const uploadedImage = await uploadSketchImage(imageFile, business.id, "annotated");
  if ("error" in uploadedImage) {
    return NextResponse.json({ error: uploadedImage.error }, { status: 400 });
  }

  const updated = await prisma.swingSketch.update({
    where: { id: sketch.id },
    data: { imageUrl: uploadedImage.url, shapesJson, ...(label !== undefined ? { label } : {}) },
  });

  return NextResponse.json(updated);
}
