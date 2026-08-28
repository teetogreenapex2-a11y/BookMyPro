import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// POST /api/auth/redeem-native-token  { token }
//
// Called by the native app's own JS, from inside its own web view, once
// it's caught the Universal Link carrying this token (see the listener
// in app/layout.tsx). This is the actual handoff moment: the token
// itself was created moments earlier in the system browser, right after
// a completely real Apple sign-in - this route doesn't create a new
// session, it just re-issues that same, already-valid session token as a
// cookie here, in the one context (the app's own web view) that couldn't
// see it before. Single-use by design: the handoff row is deleted the
// instant it's looked up, whether or not the rest of this succeeds, so
// a leaked or replayed token is never usable a second time.
export async function POST(req: NextRequest) {
  const { token } = await req.json();
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

  const handoff = await prisma.nativeAuthHandoff.findUnique({ where: { token } });
  if (handoff) {
    await prisma.nativeAuthHandoff.delete({ where: { token } }).catch(() => {});
  }
  if (!handoff || handoff.expiresAt < new Date()) {
    return NextResponse.json({ error: "This sign-in link has expired. Please try again." }, { status: 401 });
  }

  const session = await prisma.session.findUnique({ where: { sessionToken: handoff.sessionToken } });
  if (!session || session.expires < new Date()) {
    return NextResponse.json({ error: "Your session has expired. Please sign in again." }, { status: 401 });
  }

  const isHttps = (process.env.NEXTAUTH_URL || "").startsWith("https://");
  const cookieName = isHttps ? "__Secure-next-auth.session-token" : "next-auth.session-token";

  const response = NextResponse.json({ success: true, callbackUrl: handoff.callbackUrl });
  response.cookies.set(cookieName, handoff.sessionToken, {
    httpOnly: true,
    secure: isHttps,
    sameSite: "lax",
    path: "/",
    expires: session.expires,
  });
  return response;
}
