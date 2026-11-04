import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPersonalState } from "@/lib/personal";

// GET /api/personal/videos - the signed-in user's own videos + plan state.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const userId = (session.user as any).id;
  const videos = await prisma.personalVideo.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
  const state = await getPersonalState(userId);
  // Which pros each video was already sent to, shown as "Sent to ..." tags.
  const sent = await prisma.videoSubmission.findMany({
    where: { playerId: userId, videoUrl: { in: videos.map((v) => v.videoUrl) } },
    select: {
      id: true, videoUrl: true, status: true, reviewedAt: true,
      business: { select: { name: true } },
      instructor: { select: { user: { select: { name: true } } } },
      comments: { orderBy: { timestampSeconds: "asc" }, select: { id: true, timestampSeconds: true, text: true } },
    },
    orderBy: { submittedAt: "asc" },
  });
  const withSent = videos.map((v) => ({
    ...v,
    reviews: sent
      .filter((x) => x.videoUrl === v.videoUrl)
      .map((x) => ({
        id: x.id,
        proName: x.instructor.user.name || x.business.name,
        businessName: x.business.name,
        status: x.status,
        comments: x.comments,
      })),
  }));
  return NextResponse.json({ videos: withSent, ...state });
}
