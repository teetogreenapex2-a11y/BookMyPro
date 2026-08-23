import { NextRequest, NextResponse } from "next/server";
import { OAuth2Client } from "google-auth-library";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";

// POST /api/auth/google-native  { idToken }
//
// A separate sign-in path used only by the native Android/iOS app, since
// NextAuth's normal Google provider is a browser redirect flow that
// simply doesn't work inside an embedded native app view - Google itself
// blocks it there for security reasons. The native app instead uses
// Capacitor's own native Google Sign-In plugin, which hands back a real
// Google ID token directly - this route verifies that token server-side
// and signs the person in exactly as if they'd gone through the normal
// web flow, so both paths end up as the same kind of account.
//
// This can't just be a NextAuth CredentialsProvider, because NextAuth
// forces Credentials-based sign-in onto JWT sessions - but this whole app
// runs on database sessions, and mixing the two would create real
// inconsistencies elsewhere. Instead, this manually creates a database
// Session row and sets the exact same cookie NextAuth itself would use,
// so from every other route's perspective, this is a completely normal,
// ordinary logged-in session.
export async function POST(req: NextRequest) {
  const { idToken } = await req.json();
  if (!idToken) return NextResponse.json({ error: "Missing idToken" }, { status: 400 });

  const client = new OAuth2Client();
  let payload;
  try {
    const ticket = await client.verifyIdToken({
      idToken,
      // Android and the web use the Web client id as their audience, but
      // Google's native iOS SDK issues its ID token against the separate
      // iOS client id passed to SocialLogin.initialize() on that
      // platform - accepting both here is what actually lets one shared
      // route verify tokens from every platform correctly.
      audience: [
        process.env.GOOGLE_CLIENT_ID!,
        "748505012241-0ri4odsjmdmbcv9usac2ka67pgbqf9ao.apps.googleusercontent.com",
      ],
    });
    payload = ticket.getPayload();
  } catch (err) {
    console.error("Native Google sign-in - token verification failed:", err);
    return NextResponse.json({ error: "Invalid Google token" }, { status: 401 });
  }
  if (!payload?.email) {
    return NextResponse.json({ error: "Google didn't provide an email for this account" }, { status: 400 });
  }

  const email = payload.email.toLowerCase();
  const googleUserId = payload.sub;

  // Find or create the person - matches on email, same as the web flow's
  // allowDangerousEmailAccountLinking setting, so someone who already has
  // an account (e.g. from signing in via email link) gets connected to
  // that same account rather than a confusing duplicate one.
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    user = await prisma.user.create({
      data: { email, name: payload.name || null, image: payload.picture || null },
    });
  }

  // Link this Google account to the user if it isn't already - lets
  // NextAuth's own machinery (and anything else checking Accounts)
  // recognize this as a real, linked Google sign-in, not something
  // separate or unusual.
  const existingAccount = await prisma.account.findFirst({
    where: { provider: "google", providerAccountId: googleUserId },
  });
  if (!existingAccount) {
    await prisma.account.create({
      data: {
        userId: user.id,
        type: "oauth",
        provider: "google",
        providerAccountId: googleUserId,
      },
    });
  }

  // A real, ordinary database session - 30 days, matching NextAuth's own
  // default session length, so behavior is identical to the web flow.
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
