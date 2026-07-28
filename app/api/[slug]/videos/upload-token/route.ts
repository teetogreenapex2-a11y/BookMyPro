import { NextRequest, NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug, getMembership, ensureMembership, getInstructorById } from "@/lib/tenant";
import { sendPushToMembership } from "@/lib/pushNotifications";
import { businessDestination } from "@/lib/businessUrl";

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
// Important: this same route handles TWO very different kinds of
// requests - the browser's initial token request (which has a real
// session cookie), and Vercel Blob's own server-to-server callback once
// the upload finishes (which has no session cookie at all, since it's
// not coming from the user's browser). The auth check has to live inside
// onBeforeGenerateToken specifically, not at the top of this function -
// putting it at the top blocks that second, unauthenticated callback
// with a 401, which silently prevents the database record from ever
// being created even though the file itself uploaded successfully.
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const body = (await req.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
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
      // Fires once Blob confirms the upload actually completed - a
      // server-to-server callback with no session, which is exactly why
      // everything this needs (businessId, userId, uploaderIsStaff, etc.)
      // was captured into tokenPayload above during the authenticated
      // phase, rather than re-checking auth here.
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
          await sendPushToMembership(meta.instructorMembershipId, {
            title: "New swing video submitted",
            body: meta.title ? `"${meta.title}" is ready to review.` : "A new video is ready to review.",
            url: businessDestination(business.slug, "/instructor/videos"),
          });
        }
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Upload failed" }, { status: 400 });
  }
}
