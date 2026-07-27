import { NextRequest, NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug, getMembership, ensureMembership, getInstructorById } from "@/lib/tenant";

// POST /api/{slug}/videos/upload-token
//
// Vercel serverless functions have a hard 4.5MB request body limit - a
// real swing video almost always exceeds that, so uploading the file
// through a normal API route (the original approach) silently failed for
// any actual video, with no server log at all, since the platform itself
// rejects the request before our code ever runs.
//
// The fix: the browser uploads the file bytes directly to Vercel Blob,
// never touching our own server at all. This route only handles the
// secure token exchange beforehand (so uploads can't be forged) and
// creates the actual VideoSubmission record afterward, once Blob
// confirms the file genuinely landed - see handleUpload's two callbacks
// below.
//
// IMPORTANT: this route is called twice, by two different callers:
//   1. The browser calls it first to request an upload token. This call
//      carries the user's session cookie, so we can check auth here.
//   2. Vercel's Blob infrastructure calls it a second time, server-to-server,
//      once the upload finishes (to fire onUploadCompleted). This call has
//      NO session cookie - it's not from the browser at all. Gating the
//      entire route behind getServerSession() rejects this second call with
//      401, silently breaking onUploadCompleted and preventing the
//      VideoSubmission row from ever being created. So the session check
//      must live inside onBeforeGenerateToken (step 1 only), not at the
//      top of the route. handleUpload verifies the completion callback's
//      authenticity itself via signature, so no separate check is needed
//      for it.
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const body = (await req.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        // Auth check lives here, not at the top of the route, since this
        // callback only runs for the browser's initial token request -
        // not for Vercel's server-to-server completion callback.
        const session = await getServerSession(authOptions);
        if (!session) throw new Error("Sign in required");

        const userId = (session.user as any).id;
        const uploaderMembership = await getMembership(userId, business.id);
        const uploaderIsStaff = uploaderMembership?.role === "owner" || uploaderMembership?.role === "instructor";

        const meta = clientPayload ? JSON.parse(clientPayload) : {};
        const instructorMembershipId = meta.instructorMembershipId as string | undefined;
        if (!instructorMembershipId) throw new Error("Choose which instructor this is for.");
        const instructorMembership = await getInstructorById(business.id, instructorMembershipId);
        if (!instructorMembership) throw new Error("That instructor isn't available at this business.");

        if (uploaderIsStaff) {
          const suppliedPlayerId = meta.playerId as string | undefined;
          if (!suppliedPlayerId) throw new Error("Choose which player this video is for.");
          const playerMembership = await getMembership(suppliedPlayerId, business.id);
          if (!playerMembership || playerMembership.role !== "player") throw new Error("That player isn't part of this business.");
        }

        return {
          allowedContentTypes: ["video/mp4", "video/quicktime", "video/webm", "video/x-m4v"],
          maximumSizeInBytes: 200 * 1024 * 1024,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({
            businessId: business.id,
            userId,
            uploaderIsStaff,
            ...meta,
          }),
        };
      },
      // Fires once Blob confirms the upload actually completed - this is
      // where the real database record gets created, only after we know
      // the file genuinely exists in storage. Called server-to-server by
      // Vercel, with no session cookie - do not add a getServerSession()
      // check here.
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        if (!tokenPayload) return;
        const meta = JSON.parse(tokenPayload);
        const playerId = meta.uploaderIsStaff ? meta.playerId : meta.userId;

        await prisma.videoSubmission.create({
          data: {
            businessId: meta.businessId,
            playerId,
            instructorMembershipId: meta.instructorMembershipId,
            videoUrl: blob.url,
            title: meta.title || null,
            playerNote: meta.playerNote || null,
            ...(meta.uploaderIsStaff ? { status: "reviewed", reviewedAt: new Date() } : {}),
          },
        });

        if (!meta.uploaderIsStaff) {
          await ensureMembership(meta.userId, meta.businessId, "player");
        }
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Upload failed" }, { status: 400 });
  }
}
