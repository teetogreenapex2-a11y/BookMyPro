import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug, getMembership } from "@/lib/tenant";

// POST /api/{slug}/players/{id}/sandbox-link
//
// The player-side twin of /api/{slug}/instructors/{id}/sandbox-link -
// same one-time handoff mechanism (see that route's comment for the full
// explanation), just pointed at a player's own booking page instead of
// the instructor dashboard, so someone evaluating BookMyPro can see both
// halves of it: what running their business looks like, and what their
// own customers see when booking a lesson.
//
// `id` here is the player's USER id, matching how the rest of the
// players/{id}/... routes are keyed (see players/{id}/ai-analysis) -
// not a membership id like the instructor version, since a player is
// identified by their account on the customer list, not a staff row.
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
    where: { userId: params.id, businessId: business.id, role: "player" },
    include: { user: true },
  });
  if (!target) return NextResponse.json({ error: "Player not found" }, { status: 404 });

  const SESSION_LIFETIME_MS = 14 * 24 * 60 * 60 * 1000; // two weeks, matching the invite email copy
  const sessionToken = randomBytes(32).toString("hex");
  await prisma.session.create({
    data: {
      sessionToken,
      userId: target.userId,
      expires: new Date(Date.now() + SESSION_LIFETIME_MS),
    },
  });

  const handoff = await prisma.nativeAuthHandoff.create({
    data: {
      sessionToken,
      callbackUrl: `/${params.slug}/book?preview=app`,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      businessId: business.id,
      recipientName: target.user.name || target.user.email,
      recipientRole: "player",
    },
  });

  const base = process.env.NEXTAUTH_URL || "https://bookmypro.app";
  return NextResponse.json({ url: `${base}/api/auth/redeem-sandbox-link/${handoff.token}` });
}
