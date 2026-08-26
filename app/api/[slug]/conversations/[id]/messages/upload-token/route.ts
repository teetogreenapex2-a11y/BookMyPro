import { NextRequest, NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug, getBusinessInstructors } from "@/lib/tenant";
import { sendPushToMembership } from "@/lib/pushNotifications";
import { businessDestination } from "@/lib/businessUrl";
import { authorizedMembershipFor } from "../route";

// POST /api/{slug}/conversations/{id}/messages/upload-token
//
// Same two-phase Blob upload pattern as video uploads (see the sibling
// comment on app/api/{slug}/videos/upload-token/route.ts for the full
// reasoning) - the browser uploads the image bytes directly to Vercel
// Blob, this route only issues the token beforehand and creates the
// actual Message row afterward, once Blob confirms the file landed.
// Photos are well under the 4.5MB serverless body limit that made this
// approach necessary for video, but using the same pattern here keeps
// both upload paths consistent rather than having two different ways of
// doing the same kind of thing.
export async function POST(req: NextRequest, { params }: { params: { slug: string; id: string } }) {
  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const body = (await req.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async () => {
        // Reuses the exact same auth/membership check the text-message
        // route already uses, so an image message is authorized under
        // identical rules - same conversation, same role restrictions.
        const auth = await authorizedMembershipFor(req, params.slug, params.id);
        if (!auth) throw new Error("Not found");

        return {
          allowedContentTypes: ["image/jpeg", "image/png", "image/webp", "image/heic", "image/gif"],
          maximumSizeInBytes: 15 * 1024 * 1024,
          addRandomSuffix: true,
          // Captured here (the authenticated phase) for use in
          // onUploadCompleted below, which runs as an unauthenticated
          // server-to-server callback with no session of its own.
          tokenPayload: JSON.stringify({
            conversationId: params.id,
            senderMembershipId: auth.membership.id,
            senderRole: auth.membership.role,
            businessId: business.id,
            businessSlug: business.slug,
            businessName: business.name,
            playerMembershipId: auth.conversation.playerMembershipId,
          }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        if (!tokenPayload) return;
        const meta = JSON.parse(tokenPayload);

        const message = await prisma.message.create({
          data: { conversationId: meta.conversationId, senderMembershipId: meta.senderMembershipId, imageUrl: blob.url },
        });
        await prisma.conversation.update({ where: { id: meta.conversationId }, data: { lastMessageAt: message.createdAt } });

        const url = businessDestination(meta.businessSlug, meta.senderRole === "player" ? "/messages" : `/instructor/messages/${meta.conversationId}`);

        if (meta.senderRole === "player") {
          const staff = await getBusinessInstructors(meta.businessId);
          await Promise.all(
            staff.map((s: { id: string }) => sendPushToMembership(s.id, { title: "New message", body: "📷 Sent a photo", url }))
          );
        } else {
          await sendPushToMembership(meta.playerMembershipId, { title: `Message from ${meta.businessName}`, body: "📷 Sent a photo", url });
        }
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Upload failed" }, { status: 400 });
  }
}
