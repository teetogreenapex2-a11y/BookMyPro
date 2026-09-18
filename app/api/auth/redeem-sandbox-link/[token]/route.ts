import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/auth/redeem-sandbox-link/{token}
//
// This is the actual link a sandbox invite email points at - a plain
// GET, since it's meant to be clicked straight out of an email client,
// not called from the app's own JS (unlike the very similar
// /api/auth/redeem-native-token, which the native app's JS calls after
// catching a Universal Link). Same one-time-use shape though: the
// handoff row created by /api/{slug}/instructors/{id}/sandbox-link is
// looked up and deleted in the same step, so a leaked or forwarded
// invite link stops working the instant it's used once, even though the
// underlying session it hands over is good for two weeks.
export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  const handoff = await prisma.nativeAuthHandoff.findUnique({ where: { token: params.token } });
  if (handoff) {
    await prisma.nativeAuthHandoff.delete({ where: { token: params.token } }).catch(() => {});
  }

  const base = process.env.NEXTAUTH_URL || new URL(req.url).origin;
  if (!handoff || handoff.expiresAt < new Date()) {
    return NextResponse.redirect(`${base}/login?error=sandbox_link_expired`);
  }

  const session = await prisma.session.findUnique({ where: { sessionToken: handoff.sessionToken } });
  if (!session || session.expires < new Date()) {
    return NextResponse.redirect(`${base}/login?error=sandbox_link_expired`);
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
