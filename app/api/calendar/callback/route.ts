import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getRefreshTokenFromCode } from "@/lib/googleCalendar";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug, requireMembership, ensureMembership } from "@/lib/tenant";
import { businessDestination } from "@/lib/businessUrl";

// This route's URL is fixed (registered in Google Cloud Console) and can't
// be per-business — the business id comes back via the `state` param that
// /api/{slug}/calendar/connect set when it kicked off the OAuth flow.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const code = req.nextUrl.searchParams.get("code");
  const rawState = req.nextUrl.searchParams.get("state");
  if (!code || !rawState) return NextResponse.json({ error: "Missing code or state" }, { status: 400 });
  const [businessId, flag] = rawState.split(":");
  const fromOnboarding = flag === "onboarding";

  const business = await prisma.business.findUnique({ where: { id: businessId } });
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const userId = (session.user as any).id;
  const membership =
    (await requireMembership(userId, business.id, ["owner", "instructor"])) ||
    (await ensureMembership(userId, business.id, "instructor"));

  const refreshToken = await getRefreshTokenFromCode(code);
  if (!refreshToken) {
    // Google only returns a refresh_token on the first consent. If this happens on
    // a reconnect, revoke access at https://myaccount.google.com/permissions and retry.
    return NextResponse.redirect(
      fromOnboarding
        ? `${process.env.NEXTAUTH_URL}/onboarding?slug=${business.slug}&step=4&calendar=error`
        : businessDestination(business.slug, "/settings?calendar=error")
    );
  }

  await prisma.membership.update({
    where: { id: membership.id },
    data: { googleRefreshToken: refreshToken },
  });
  // Connecting Google makes it this business's active provider — mirrors
  // how choosing Stripe/Square works for payments.
  await prisma.business.update({ where: { id: business.id }, data: { calendarProvider: "google" } });

  return NextResponse.redirect(
    fromOnboarding
      ? `${process.env.NEXTAUTH_URL}/onboarding?slug=${business.slug}&step=4&calendar=connected`
      : businessDestination(business.slug, "/settings?calendar=connected")
  );
}
