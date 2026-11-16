import { NextRequest, NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug, getMembership } from "@/lib/tenant";

// POST /api/{slug}/videos/{id}/voice-token - lets the assigned instructor (or owner)
// upload a voice-over straight to Blob. The browser then calls .../voice with the URL.
export async function POST(req: NextRequest, { params }: { params: { slug: string; id: string } }) {
  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });
  const body = (await req.json()) as HandleUploadBody;
  try {
    const json = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async () => {
        const session = await getServerSession(authOptions);
        if (!session) throw new Error("Sign in required");
        const membership = await getMembership((session.user as any).id, business.id);
        const submission = await prisma.videoSubmission.findFirst({ where: { id: params.id, businessId: business.id } });
        if (!submission) throw new Error("Video not found");
        if (membership?.role !== "owner" && submission.instructorMembershipId !== membership?.id) throw new Error("Only the assigned instructor can add a voice-over");
        return {
          allowedContentTypes: ["audio/mp4", "audio/webm", "audio/mpeg", "audio/x-m4a", "audio/aac", "audio/ogg", "audio/wav"],
          maximumSizeInBytes: 25 * 1024 * 1024,
          addRandomSuffix: true,
        };
      },
      onUploadCompleted: async () => {},
    });
    return NextResponse.json(json);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Upload failed" }, { status: 400 });
  }
}
