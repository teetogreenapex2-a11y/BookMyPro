import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/auth/redeem-sandbox-link/{token}
//
// This is the actual link a sandbox invite email points at - a plain
// GET, since it's meant to be clicked straight out of an email client,
// not called from the app's own JS (unlike the very similar
// /api/auth/redeem-native-token, which the native app's JS calls after
// catching a Universal Link). Still one-time-use, but the handoff row is
// now marked used (redeemedAt) instead of deleted, so the owner can see
// who opened their invite link and when (GET /api/{slug}/sandbox-links) -
// a leaked or forwarded invite link still stops working the instant it's
// used once, it just leaves a record behind instead of vanishing.
export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  const base = process.env.NEXTAUTH_URL || new URL(req.url).origin;
  const handoff = await prisma.nativeAuthHandoff.findUnique({ where: { token: params.token } });

  if (!handoff || handoff.expiresAt < new Date()) {
    return NextResponse.redirect(`${base}/login?error=sandbox_link_expired`);
  }
  if (handoff.redeemedAt) {
    return NextResponse.redirect(`${base}/login?error=sandbox_link_used`);
  }

  const session = await prisma.session.findUnique({ where: { sessionToken: handoff.sessionToken } });
  if (!session || session.expires < new Date()) {
    return NextResponse.redirect(`${base}/login?error=sandbox_link_expired`);
  }

  // Claim it atomically: only succeeds if nobody else claimed it between
  // the lookup above and now (e.g. an email client pre-fetching the link
  // as a "safety" scan). If someone else already claimed it, treat this
  // request the same as an already-used link.
  const claim = await prisma.nativeAuthHandoff.updateMany({
    where: { token: params.token, redeemedAt: null },
    data: { redeemedAt: new Date() },
  });
  if (claim.count === 0) {
    return NextResponse.redirect(`${base}/login?error=sandbox_link_used`);
  }

  const isHttps = base.startsWith("https://");
  const cookieName = isHttps ? "__Secure-next-auth.session-token" : "next-auth.session-token";

  const response = NextResponse.redirect(`${base}${handoff.callbackUrl}`);
  response.cookies.set(cookieName, handoff.sessionToken, {
    httpOnly: true,
    secure: isHttps,
    sameSite: "lax",
    path: "/",
    expires: session.expires,
  });
  return response;
}
