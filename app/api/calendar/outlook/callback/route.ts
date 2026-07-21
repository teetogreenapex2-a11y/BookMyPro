import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { exchangeOutlookCode } from "@/lib/outlook";
import { prisma } from "@/lib/prisma";
import { requireMembership, ensureMembership } from "@/lib/tenant";
import { businessDestination } from "@/lib/businessUrl";

// This route's URL is fixed (registered in the Azure portal) and can't be
// per-business — the business id comes back via the `state` param that
// /api/{slug}/calendar/outlook/connect set when it kicked off the OAuth flow.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const code = req.nextUrl.searchParams.get("code");
  const rawState = req.nextUrl.searchParams.get("state");
  const err = req.nextUrl.searchParams.get("error");
  if (err) return NextResponse.json({ error: `Microsoft declined: ${err}` }, { status: 400 });
  if (!code || !rawState) return NextResponse.json({ error: "Missing code or state" }, { status: 400 });
  const [businessId, flag] = rawState.split(":");
  const fromOnboarding = flag === "onboarding";

  const business = await prisma.business.findUnique({ where: { id: businessId } });
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const userId = (session.user as any).id;
  const membership =
    (await requireMembership(userId, business.id, ["owner", "instructor"])) ||
    (await ensureMembership(userId, business.id, "instructor"));

  try {
    const tokens = await exchangeOutlookCode(code);
    await prisma.membership.update({
      where: { id: membership.id },
      data: {
        outlookAccessToken: tokens.accessToken,
        outlookRefreshToken: tokens.refreshToken,
        outlookTokenExpiresAt: tokens.expiresAt,
      },
    });
    // Connecting Outlook makes it this business's active provider — mirrors
    // how choosing Stripe/Square works for payments.
    await prisma.business.update({ where: { id: business.id }, data: { calendarProvider: "outlook" } });
  } catch (e) {
    console.error("Outlook OAuth token exchange failed:", e);
    return NextResponse.redirect(
      fromOnboarding
        ? `${process.env.NEXTAUTH_URL}/onboarding?slug=${business.slug}&step=4&calendar=error`
        : businessDestination(business.slug, "/settings?calendar=error")
    );
  }

  return NextResponse.redirect(
    fromOnboarding
      ? `${process.env.NEXTAUTH_URL}/onboarding?slug=${business.slug}&step=4&calendar=connected`
      : businessDestination(business.slug, "/settings?calendar=connected")
  );
}
