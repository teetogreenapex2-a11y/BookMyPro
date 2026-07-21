import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug, getMembership } from "@/lib/tenant";

// GET /api/{slug}/videos/{id} — the player who submitted it, or the
// instructor it's assigned to (or the owner), can view it.
export async function GET(req: NextRequest, { params }: { params: { slug: string; id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const userId = (session.user as any).id;
  const submission = await prisma.videoSubmission.findFirst({
    where: { id: params.id, businessId: business.id },
    include: {
      player: { select: { name: true, email: true } },
      instructor: { include: { user: { select: { name: true } } } },
      comments: { orderBy: { timestampSeconds: "asc" } },
    },
  });
  if (!submission) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const membership = await getMembership(userId, business.id);
  const isOwner = membership?.role === "owner";
  const isAssignedInstructor = submission.instructorMembershipId === membership?.id;
  const isSubmitter = submission.playerId === userId;
  if (!isOwner && !isAssignedInstructor && !isSubmitter) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: submission.id,
    videoUrl: submission.videoUrl,
    title: submission.title,
    playerNote: submission.playerNote,
    status: submission.status,
    submittedAt: submission.submittedAt,
    reviewedAt: submission.reviewedAt,
    playerName: submission.player.name || submission.player.email,
    instructorName: submission.instructor.user.name,
    instructorMembershipId: submission.instructorMembershipId,
    comments: submission.comments.map((c) => ({ id: c.id, timestampSeconds: c.timestampSeconds, text: c.text, createdAt: c.createdAt })),
  });
}

// PATCH /api/{slug}/videos/{id}  { status: "reviewed" }
// The assigned instructor (or the owner) marks a submission as reviewed —
// separate from leaving comments, since an instructor might watch and
// decide there's nothing worth flagging, or wants to explicitly close it
// out after adding comments.
export async function PATCH(req: NextRequest, { params }: { params: { slug: string; id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const submission = await prisma.videoSubmission.findFirst({ where: { id: params.id, businessId: business.id } });
  if (!submission) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const membership = await getMembership((session.user as any).id, business.id);
  const isOwner = membership?.role === "owner";
  const isAssignedInstructor = submission.instructorMembershipId === membership?.id;
  if (!isOwner && !isAssignedInstructor) {
    return NextResponse.json({ error: "Only the assigned instructor can update this" }, { status: 403 });
  }

  const { status } = await req.json();
  if (status !== "reviewed" && status !== "pending") {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const updated = await prisma.videoSubmission.update({
    where: { id: submission.id },
    data: { status, reviewedAt: status === "reviewed" ? new Date() : null },
  });
  return NextResponse.json(updated);
}
