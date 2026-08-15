import { PrismaAdapter } from "@next-auth/prisma-adapter";
import GoogleProvider from "next-auth/providers/google";
import AppleProvider from "next-auth/providers/apple";
import EmailProvider from "next-auth/providers/email";
import type { NextAuthOptions } from "next-auth";
import { prisma } from "./prisma";
import { sendMagicLinkEmail } from "./email";
import { generateAppleClientSecret } from "./appleAuth";

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: { params: { scope: "openid email profile" } },
      allowDangerousEmailAccountLinking: true,
    }),
    // Only registered if the Apple credentials are actually configured -
    // avoids a hard crash on every sign-in attempt while this is still
    // being set up, since an empty/missing provider config would
    // otherwise break NextAuth entirely rather than just hiding the button.
    ...(process.env.APPLE_CLIENT_ID && process.env.APPLE_PRIVATE_KEY
      ? [
          AppleProvider({
            clientId: process.env.APPLE_CLIENT_ID,
            clientSecret: generateAppleClientSecret(),
            allowDangerousEmailAccountLinking: true,
          }),
        ]
      : []),
    EmailProvider({
      server: { host: "unused", port: 587, auth: { user: "unused", pass: "unused" } },
      from: process.env.RESEND_FROM_EMAIL || "notifications@example.com",
      sendVerificationRequest: async ({ identifier, url }) => {
        await sendMagicLinkEmail(identifier, url);
      },
    }),
  ],
  session: { strategy: "database" },
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
