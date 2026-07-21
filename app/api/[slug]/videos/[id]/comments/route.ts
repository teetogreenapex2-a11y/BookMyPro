import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug, getMembership } from "@/lib/tenant";
import { sendVideoReviewedNotification } from "@/lib/email";

// POST /api/{slug}/videos/{id}/comments  { timestampSeconds, text }
// Only the assigned instructor (or the owner) can leave comments — a
// player can view them but not add their own, since this is instructor
// feedback, not a discussion thread.
export async function POST(req: NextRequest, { params }: { params: { slug: string; id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const submission = await prisma.videoSubmission.findFirst({
    where: { id: params.id, businessId: business.id },
    include: { player: { select: { name: true, email: true } } },
  });
  if (!submission) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const membership = await getMembership((session.user as any).id, business.id);
  const isOwner = membership?.role === "owner";
  const isAssignedInstructor = submission.instructorMembershipId === membership?.id;
  if (!isOwner && !isAssignedInstructor) {
    return NextResponse.json({ error: "Only the assigned instructor can comment on this" }, { status: 403 });
  }

  const { timestampSeconds, text } = await req.json();
  if (typeof timestampSeconds !== "number" || timestampSeconds < 0) {
    return NextResponse.json({ error: "Invalid timestamp" }, { status: 400 });
  }
  if (!text?.trim()) {
    return NextResponse.json({ error: "Comment can't be empty" }, { status: 400 });
  }

  const comment = await prisma.videoComment.create({
    data: { submissionId: submission.id, timestampSeconds, text: text.trim() },
  });

  // First comment on a submission is a reasonable "review has started"
  // signal — mark it reviewed automatically so it drops off the
  // instructor's pending queue without a separate manual step, same idea
  // as marking a fitting done once it's actually been given.
  if (submission.status === "pending") {
    await prisma.videoSubmission.update({ where: { id: submission.id }, data: { status: "reviewed", reviewedAt: new Date() } });
    if (submission.player.email) {
      await sendVideoReviewedNotification(submission.player.email, {
        businessName: business.name,
        title: submission.title,
      }).catch((err) => console.error("Video-reviewed email failed:", err));
    }
  }

  return NextResponse.json(comment, { status: 201 });
}
