import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug, requireMembership } from "@/lib/tenant";
import { createConnectedAccount, createAccountOnboardingLink } from "@/lib/stripe";
import { getBusinessAbsoluteUrl, getBusinessApiUrl } from "@/lib/businessUrl";

// GET /api/{slug}/stripe/connect — owner/instructor only.
// Creates the business's Stripe Express account on first call, then
// generates a fresh onboarding link and redirects there. Safe to call again
// later too (e.g. if they didn't finish onboarding) — it reuses the
// existing account and just issues a new link.
export async function GET(req: Request, { params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const membership = await requireMembership((session.user as any).id, business.id, ["owner", "instructor"]);
  if (!membership) return NextResponse.json({ error: "Instructor access required" }, { status: 403 });

  let accountId = business.stripeAccountId;
  if (!accountId) {
    accountId = await createConnectedAccount(business.email || session.user?.email || "");
    await prisma.business.update({ where: { id: business.id }, data: { stripeAccountId: accountId } });
  }

  const returnUrl = getBusinessAbsoluteUrl(req, business.slug, "/settings?stripe=connected");
  const refreshUrl = getBusinessApiUrl(req, business.slug, "/stripe/connect"); // Stripe re-hits this route if the link expired mid-onboarding

  const url = await createAccountOnboardingLink(accountId, returnUrl, refreshUrl);
  return NextResponse.redirect(url);
}
