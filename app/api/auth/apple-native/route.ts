import { NextRequest, NextResponse } from "next/server";
import appleSignin from "apple-signin-auth";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";

// POST /api/auth/apple-native  { identityToken, name? }
//
// Same reasoning as /api/auth/google-native - the native iOS app uses
// Apple's own native Sign in with Apple SDK instead of a web redirect,
// which hands back a real, signed identity token directly. This route
// verifies that token server-side and signs the person in exactly as
// the normal web flow would.
//
// One real difference from Google: the token's audience is the app's
// own bundle id (com.bookmypro.app), not the separate Services ID used
// for the website's OAuth flow - those are two different identifiers
// Apple treats as different "clients," even though they're the same
// sign-in feature.
//
// Apple only ever sends the person's name on their very first sign-in,
// never again after that - so it's passed through here and saved
// immediately, since there's no way to recover it later if it's missed.
export async function POST(req: NextRequest) {
  const { identityToken, name } = await req.json();
  if (!identityToken) return NextResponse.json({ error: "Missing identityToken" }, { status: 400 });

  let payload;
  try {
    payload = await appleSignin.verifyIdToken(identityToken, {
      audience: process.env.APPLE_NATIVE_BUNDLE_ID || "com.bookmypro.app",
      ignoreExpiration: false,
    });
  } catch (err) {
    console.error("Native Apple sign-in - token verification failed:", err);
    return NextResponse.json({ error: "Invalid Apple token" }, { status: 401 });
  }

  const appleUserId = payload.sub;
  // Apple's own private-relay emails (ending in @privaterelay.appleid.com)
  // are real, working addresses - genuinely fine to treat like any other.
  const email = payload.email?.toLowerCase();
  if (!email) {
    return NextResponse.json({ error: "Apple didn't provide an email for this account" }, { status: 400 });
  }

  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    user = await prisma.user.create({
      data: { email, name: name || null },
    });
  }

  const existingAccount = await prisma.account.findFirst({
    where: { provider: "apple", providerAccountId: appleUserId },
  });
  if (!existingAccount) {
    await prisma.account.create({
      data: {
        userId: user.id,
        type: "oauth",
        provider: "apple",
        providerAccountId: appleUserId,
      },
    });
  }

  const sessionToken = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await prisma.session.create({
    data: { sessionToken, userId: user.id, expires },
  });

  const isHttps = (process.env.NEXTAUTH_URL || "").startsWith("https://");
  const cookieName = isHttps ? "__Secure-next-auth.session-token" : "next-auth.session-token";

  const response = NextResponse.json({ success: true });
  response.cookies.set(cookieName, sessionToken, {
    httpOnly: true,
    secure: isHttps,
    sameSite: "lax",
    path: "/",
    expires,
  });
  return response;
}
