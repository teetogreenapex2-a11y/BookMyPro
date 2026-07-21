import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug, getMembership, ensureMembership, getInstructorById } from "@/lib/tenant";
import { uploadSwingVideo } from "@/lib/videoStorage";

// GET /api/{slug}/videos — a player sees their own submissions; an
// instructor/owner sees submissions assigned to them (owner sees all,
// matching how the rest of the app scopes "assigned to me" data).
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const userId = (session.user as any).id;
  const membership = await getMembership(userId, business.id);

  const isStaff = membership?.role === "owner" || membership?.role === "instructor";
  const submissions = await prisma.videoSubmission.findMany({
    where: isStaff
      ? { businessId: business.id, ...(membership!.role === "instructor" ? { instructorMembershipId: membership!.id } : {}) }
      : { businessId: business.id, playerId: userId },
    include: {
      player: { select: { name: true, email: true } },
      instructor: { include: { user: { select: { name: true } } } },
      comments: { orderBy: { timestampSeconds: "asc" } },
    },
    orderBy: { submittedAt: "desc" },
  });

  const shaped = submissions.map((s) => ({
    id: s.id,
    videoUrl: s.videoUrl,
    title: s.title,
    playerNote: s.playerNote,
    status: s.status,
    submittedAt: s.submittedAt,
    reviewedAt: s.reviewedAt,
    playerName: s.player.name || s.player.email,
    instructorName: s.instructor.user.name,
    instructorMembershipId: s.instructorMembershipId,
    comments: s.comments.map((c) => ({ id: c.id, timestampSeconds: c.timestampSeconds, text: c.text, createdAt: c.createdAt })),
  }));

  return NextResponse.json(shaped);
}

// POST /api/{slug}/videos — multipart form: video (file), instructorMembershipId, title?, playerNote?
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const userId = (session.user as any).id;
  await ensureMembership(userId, business.id, "player");

  const form = await req.formData();
  const file = form.get("video");
  const instructorMembershipId = form.get("instructorMembershipId")?.toString();
  const title = form.get("title")?.toString() || null;
  const playerNote = form.get("playerNote")?.toString() || null;

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No video file was included" }, { status: 400 });
  }
  if (!instructorMembershipId) {
    return NextResponse.json({ error: "Choose which instructor this is for" }, { status: 400 });
  }
  const instructorMembership = await getInstructorById(business.id, instructorMembershipId);
  if (!instructorMembership) {
    return NextResponse.json({ error: "That instructor isn't available at this business" }, { status: 400 });
  }

  const uploaded = await uploadSwingVideo(file, business.id);
  if ("error" in uploaded) {
    return NextResponse.json({ error: uploaded.error }, { status: 400 });
  }

  const submission = await prisma.videoSubmission.create({
    data: {
      businessId: business.id,
      playerId: userId,
      instructorMembershipId,
      videoUrl: uploaded.url,
      title,
      playerNote,
    },
  });

  return NextResponse.json(submission, { status: 201 });
}
