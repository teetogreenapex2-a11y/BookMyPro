import { NextRequest, NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPersonalState, PERSONAL_VIDEO_CAP } from "@/lib/personal";

// POST /api/personal/videos/upload-token
// Same two-phase pattern as the business video upload: the auth + plan
// checks live in onBeforeGenerateToken (the browser's request has a
// session), and the database row is created in onUploadCompleted (Vercel
// Blob's server-to-server callback has no session at all).
export async function POST(req: NextRequest) {
  const body = (await req.json()) as HandleUploadBody;
  try {
    const jsonResponse = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        const session = await getServerSession(authOptions);
        if (!session) throw new Error("Sign in required");
        const userId = (session.user as any).id as string;
        const state = await getPersonalState(userId);
        if (!state.canUpload) throw new Error("Your free week is over - subscribe to keep uploading.");
        if (state.count >= PERSONAL_VIDEO_CAP) throw new Error(`You've reached ${PERSONAL_VIDEO_CAP} videos. Delete one to add another.`);
        const meta = clientPayload ? JSON.parse(clientPayload) : {};
        return {
          allowedContentTypes: ["video/mp4", "video/quicktime", "video/webm", "video/x-m4v"],
          maximumSizeInBytes: 200 * 1024 * 1024,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ userId, title: meta.title || null, note: meta.note || null }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        if (!tokenPayload) return;
        const meta = JSON.parse(tokenPayload);
        await prisma.personalVideo.create({
          data: { userId: meta.userId, videoUrl: blob.url, title: meta.title, note: meta.note },
        });
      },
    });
    return NextResponse.json(jsonResponse);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Upload failed" }, { status: 400 });
  }
}
