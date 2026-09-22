import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getBusinessBySlug, requireMembership } from "@/lib/tenant";
import { stripe, createConnectedAccount, createAccountOnboardingLink, isAccountAccessError } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { businessDestination } from "@/lib/businessUrl";

// GET /api/{slug}/stripe/connect — kicks off (or resumes) Stripe's hosted
// Express onboarding for this business. Unlike the Google/Square OAuth
// flows, Stripe Account Links carry the return/refresh URLs directly (no
// shared callback route or `state` param needed), so this route both
// creates the connected account on first use and redirects straight to
// Stripe's hosted onboarding.
//
// NOTE: this file previously contained a stray copy of the Stripe webhook
// handler (the real one lives at app/api/stripe/webhook/route.ts, which is
// the fixed URL actually registered in the Stripe Dashboard) - that
// leftover meant this route had no GET handler at all, so "Connect Stripe"
// / "Reconnect" in Settings silently failed.
export async function GET(req: Request, { params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const membership = await requireMembership((session.user as any).id, business.id, ["owner", "instructor"]);
  if (!membership) return NextResponse.json({ error: "Instructor access required" }, { status: 403 });

  const from = new URL(req.url).searchParams.get("from");
  const isOnboarding = from === "onboarding";
  const returnUrl = isOnboarding
    ? `${process.env.NEXTAUTH_URL}/onboarding?slug=${business.slug}&step=5&stripe=connected`
    : businessDestination(business.slug, "/settings?stripe=connected");
  const refreshUrl = isOnboarding
    ? `${process.env.NEXTAUTH_URL}/onboarding?slug=${business.slug}&step=5&stripe=error`
    : businessDestination(business.slug, "/settings?stripe=error");

  try {
    let accountId: string | null = business.stripeAccountId;

    if (accountId) {
      // Confirm the platform can still reach this account before reusing
      // it. Stripe returns a permission error once a merchant disconnects
      // the app (or the account is closed) - reusing that id here would
      // just fail with the same error all over again.
      const stillUsable = await stripe.accounts
        .retrieve(accountId)
        .then(() => true)
        .catch((err) => {
          if (isAccountAccessError(err)) return false;
          throw err;
        });
      if (!stillUsable) accountId = null;
    }

    if (!accountId) {
      accountId = await createConnectedAccount((session.user as any).email || business.email || "");
      await prisma.business.update({ where: { id: business.id }, data: { stripeAccountId: accountId } });
    }

    const onboardingUrl = await createAccountOnboardingLink(accountId, returnUrl, refreshUrl);
    return NextResponse.redirect(onboardingUrl);
  } catch (err) {
    console.error("Failed to start Stripe onboarding:", err);
    return NextResponse.redirect(refreshUrl);
  }
}
