import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug, getMembership } from "@/lib/tenant";

// POST /api/{slug}/instructors/{id}/sandbox-link
//
// Owner-only. Generates a real, working sign-in link for this
// membership's account, in one click, with nothing sent to their inbox
// first - meant for the "try BookMyPro before you install it" invite
// email, where the whole point is that clicking the link is the entire
// experience.
//
// This deliberately doesn't reuse the normal Email-provider magic-link
// flow, since that only ever emails a link to the account holder
// themselves, on their own request - there's no way for the owner to
// generate or see that link on someone else's behalf. Instead this
// mints a real database Session directly (the same row NextAuth's own
// sign-in would produce) and wraps it in the same one-time handoff
// pattern already used for the native app's own sign-in handoff (see
// the NativeAuthHandoff model) - a short-lived redemption token that,
// once visited, sets the real session cookie and disappears, so the
// link itself can't be replayed indefinitely even though the session it
// hands over lives for two weeks (matching the sandbox invite copy).
export async function POST(req: NextRequest, { params }: { params: { slug: string; id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const requesterMembership = await getMembership((session.user as any).id, business.id);
  if (requesterMembership?.role !== "owner") {
    return NextResponse.json({ error: "Only the owner can generate a sandbox link" }, { status: 403 });
  }

  const target = await prisma.membership.findFirst({
    where: { id: params.id, businessId: business.id, role: { in: ["owner", "instructor"] } },
    include: { user: true },
  });
  if (!target) return NextResponse.json({ error: "Instructor not found" }, { status: 404 });

  const SESSION_LIFETIME_MS = 14 * 24 * 60 * 60 * 1000; // two weeks, matching the invite email copy
  const sessionToken = randomBytes(32).toString("hex");
  await prisma.session.create({
    data: {
      sessionToken,
      userId: target.user.id,
      expires: new Date(Date.now() + SESSION_LIFETIME_MS),
    },
  });

  const handoff = await prisma.nativeAuthHandoff.create({
    data: {
      sessionToken,
      callbackUrl: `/${params.slug}/instructor?preview=app`,
      // The link itself only needs to survive until it's actually
      // clicked, not the full two weeks the resulting session lasts -
      // 7 days is generous room for an invite email to sit unread
      // without leaving a long-lived, un-clicked login link around.
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      businessId: business.id,
      recipientName: target.user.name || target.user.email,
      recipientRole: "instructor",
    },
  });

  const base = process.env.NEXTAUTH_URL || "https://bookmypro.app";
  return NextResponse.json({ url: `${base}/api/auth/redeem-sandbox-link/${handoff.token}` });
}
