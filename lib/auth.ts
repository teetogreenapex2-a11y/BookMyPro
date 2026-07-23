import { PrismaAdapter } from "@next-auth/prisma-adapter";
import GoogleProvider from "next-auth/providers/google";
import EmailProvider from "next-auth/providers/email";
import type { NextAuthOptions } from "next-auth";
import { prisma } from "./prisma";
import { sendMagicLinkEmail } from "./email";

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: { params: { scope: "openid email profile" } },
      allowDangerousEmailAccountLinking: true,
    }),
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
