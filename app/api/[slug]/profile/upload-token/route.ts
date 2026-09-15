import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug, requireMembership } from "@/lib/tenant";

// POST /api/{slug}/profile/upload-token
//
// Same two-phase Blob upload pattern used elsewhere (see the comment on
// app/api/{slug}/videos/upload-token/route.ts for the full reasoning) -
// the browser uploads the photo directly to Vercel Blob, this route only
// issues the token beforehand and updates the target's bioPhotoUrl
// afterward, once Blob confirms the file landed. An owner can pass a
// specific team member's membership id via clientPayload to update their
// photo instead of their own - verified the same way as the bio route.
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const body = (await req.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        const membership = await requireMembership((session.user as any).id, business.id, ["owner", "instructor"]);
        if (!membership) throw new Error("Staff access required");

        let updateId = membership.id;
        const targetMembershipId = clientPayload ? JSON.parse(clientPayload).targetMembershipId : null;
        if (targetMembershipId && targetMembershipId !== membership.id) {
          if (membership.role !== "owner") throw new Error("Only the owner can edit someone else's photo");
          const target = await prisma.membership.findFirst({ where: { id: targetMembershipId, businessId: business.id } });
          if (!target) throw new Error("That team member wasn't found");
          updateId = target.id;
        }

        return {
          allowedContentTypes: ["image/jpeg", "image/png", "image/webp", "image/heic"],
          maximumSizeInBytes: 8 * 1024 * 1024,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ membershipId: updateId }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        if (!tokenPayload) return;
        const { membershipId } = JSON.parse(tokenPayload);
        await prisma.membership.update({ where: { id: membershipId }, data: { bioPhotoUrl: blob.url } });
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Upload failed" }, { status: 400 });
  }
}
