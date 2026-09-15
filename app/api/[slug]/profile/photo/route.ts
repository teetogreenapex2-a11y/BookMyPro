import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug, requireMembership } from "@/lib/tenant";

// POST /api/{slug}/profile/photo  { url, targetMembershipId? }
//
// Saves the bio photo URL directly, right after the client's upload
// succeeds - a more reliable complement to the async onUploadCompleted
// webhook in upload-token/route.ts, which depends on Vercel Blob being
// able to reach back to this server to report completion. If that
// webhook silently doesn't fire, the file still exists in Blob storage
// but the database never learns its URL - this route closes that gap
// by having the client, which already has the URL the moment upload()
// returns, save it immediately itself instead of waiting on a webhook.
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const membership = await requireMembership((session.user as any).id, business.id, ["owner", "instructor"]);
  if (!membership) return NextResponse.json({ error: "Staff access required" }, { status: 403 });

  const { url, targetMembershipId } = await req.json();
  if (typeof url !== "string" || !url) return NextResponse.json({ error: "url required" }, { status: 400 });

  let updateId = membership.id;
  if (targetMembershipId && targetMembershipId !== membership.id) {
    if (membership.role !== "owner") return NextResponse.json({ error: "Only the owner can edit someone else's photo" }, { status: 403 });
    const target = await prisma.membership.findFirst({ where: { id: targetMembershipId, businessId: business.id } });
    if (!target) return NextResponse.json({ error: "That team member wasn't found" }, { status: 404 });
    updateId = target.id;
  }

  await prisma.membership.update({ where: { id: updateId }, data: { bioPhotoUrl: url } });
  return NextResponse.json({ ok: true });
}
