import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { deleteSwingVideo } from "@/lib/videoStorage";

// DELETE /api/personal/videos/{id} - removes the row and the stored file.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const userId = (session.user as any).id;
  const video = await prisma.personalVideo.findFirst({ where: { id: params.id, userId } });
  if (!video) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.personalVideo.delete({ where: { id: video.id } });
  // If a pro was sent this video, the file is shared with their copy - keep
  // the stored file so it doesn't vanish from their review queue.
  const shared = await prisma.videoSubmission.count({ where: { videoUrl: video.videoUrl } });
  if (shared === 0) await deleteSwingVideo(video.videoUrl);
  return NextResponse.json({ ok: true });
}

// PATCH - rename / edit note.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const userId = (session.user as any).id;
  const body = await req.json().catch(() => ({}));
  const video = await prisma.personalVideo.findFirst({ where: { id: params.id, userId } });
  if (!video) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const updated = await prisma.personalVideo.update({
    where: { id: video.id },
    data: {
      ...(typeof body.title === "string" ? { title: body.title.trim().slice(0, 120) || null } : {}),
      ...(typeof body.note === "string" ? { note: body.note.trim().slice(0, 1000) || null } : {}),
    },
  });
  return NextResponse.json(updated);
}
