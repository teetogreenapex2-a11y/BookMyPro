import { PrismaAdapter } from "@next-auth/prisma-adapter";
import GoogleProvider from "next-auth/providers/google";
import AppleProvider from "next-auth/providers/apple";
import EmailProvider from "next-auth/providers/email";
import type { NextAuthOptions } from "next-auth";
import { prisma } from "./prisma";
import { sendMagicLinkEmail } from "./email";
import { generateAppleClientSecret } from "./appleAuth";

// Built ahead of time, defensively - a malformed or misconfigured Apple
// key should only ever mean the Apple button doesn't show up, never a
// crash that takes down every route in the app that checks who's signed
// in (which is most of them, since they all import authOptions).
function buildAppleProvider() {
  if (!process.env.APPLE_CLIENT_ID || !process.env.APPLE_PRIVATE_KEY) return null;
  try {
    return AppleProvider({
      clientId: process.env.APPLE_CLIENT_ID,
      clientSecret: generateAppleClientSecret(),
      allowDangerousEmailAccountLinking: true,
    });
  } catch (err) {
    console.error("Apple sign-in isn't configured correctly - the Apple button will be hidden until it's fixed:", err);
    return null;
  }
}
const appleProvider = buildAppleProvider();

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: { params: { scope: "openid email profile" } },
      allowDangerousEmailAccountLinking: true,
    }),
    ...(appleProvider ? [appleProvider] : []),
    EmailProvider({
      server: { host: "unused", port: 587, auth: { user: "unused", pass: "unused" } },
      from: process.env.RESEND_FROM_EMAIL || "notifications@example.com",
      sendVerificationRequest: async ({ identifier, url }) => {
        await sendMagicLinkEmail(identifier, url);
      },
    }),
  ],
  session: { strategy: "database" },
  // Apple's own callback arrives as a genuine cross-site POST request
  // (its own quirk - Google's doesn't work this way), and the default
  // cookie setting doesn't survive that trip at all, which is exactly
  // what was causing "PKCE code_verifier cookie was missing" on every
  // real sign-in attempt. This is the documented, known fix.
  cookies: {
    pkceCodeVerifier: {
      name: "next-auth.pkce.code_verifier",
      options: {
        httpOnly: true,
        sameSite: "none",
        path: "/",
        secure: true,
      },
    },
  },
  callbacks: {
    async session({ session, user }) {
      if (session.user) {
        (session.user as any).id = user.id;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
};
