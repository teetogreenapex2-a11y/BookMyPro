import { PrismaAdapter } from "@next-auth/prisma-adapter";
import GoogleProvider from "next-auth/providers/google";
import type { NextAuthOptions } from "next-auth";
import { prisma } from "./prisma";

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      // Basic login scope only. Calendar access is requested separately
      // via the instructor's "Connect Google Calendar" flow (lib/googleCalendar.ts),
      // so players are never prompted for calendar permissions.
      authorization: { params: { scope: "openid email profile" } },
      // Lets a Google sign-in link to an existing User row with the same
      // email, instead of failing on the unique email constraint. This
      // matters because instructors can manually add a customer (see
      // app/api/[slug]/players/manual) before that person ever signs in —
      // when they eventually do sign in with Google, this connects them to
      // their existing record (packages, bookings, etc.) instead of
      // erroring out or creating a duplicate account. Considered "safe"
      // here because Google verifies the email address on their end, so
      // this can't be used to impersonate someone else's email.
      allowDangerousEmailAccountLinking: true,
    }),
  ],
  session: { strategy: "database" },
  callbacks: {
    async session({ session, user }) {
      if (session.user) {
        (session.user as any).id = user.id;
        // Role is no longer global — it's per-business via the Membership
        // table. Pages/routes now resolve "what's my role at this business?"
        // using lib/tenant.ts (getMembership) once they know which business
        // the current URL is for. See multi-tenant-scoping.md §4.
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
};
