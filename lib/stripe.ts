import Stripe from "stripe";

if (!process.env.STRIPE_SECRET_KEY) {
  console.warn("STRIPE_SECRET_KEY is not set — Stripe calls will fail until it is.");
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "sk_test_placeholder", {
  apiVersion: "2024-06-20",
});

// --- Stripe Connect ---
// Each business gets its own Express account so payments go directly to
// them — the platform (you) never touches their money. Checkout sessions
// are created as "direct charges" on the connected account (passing
// { stripeAccount: business.stripeAccountId } as a request option), so the
// connected account is the merchant of record.

export async function createConnectedAccount(email: string) {
  const account = await stripe.accounts.create({
    type: "express",
    email,
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
  });
  return account.id;
}

// Account Links are per-session and don't need to be pre-registered
// anywhere (unlike the Google OAuth redirect URI) — return/refresh URLs are
// just passed in directly, so this can be fully per-business/per-slug.
export async function createAccountOnboardingLink(accountId: string, returnUrl: string, refreshUrl: string) {
  const link = await stripe.accountLinks.create({
    account: accountId,
    type: "account_onboarding",
    return_url: returnUrl,
    refresh_url: refreshUrl,
  });
  return link.url;
}

export async function getAccountStatus(accountId: string) {
  const account = await stripe.accounts.retrieve(accountId);
  return {
    detailsSubmitted: account.details_submitted,
    chargesEnabled: account.charges_enabled,
    payoutsEnabled: account.payouts_enabled,
  };
}

// --- Platform billing (BookMyPro's own subscription revenue) ---
// Deliberately separate section from everything above - every function
// above either creates or acts on a business's own connected account
// (their money, from their players). This is the only place that ever
// charges *the business itself*, on the platform's own, regular Stripe
// account - never passing { stripeAccount: ... } at all, which is
// exactly what would make this a connected-account charge instead of
// a platform one.
const PLATFORM_PRICE_IDS = {
  monthly: "price_1UBJcS4uMHGraF5nhGskUm62",
  academyBase: "price_1UBJhv4uMHGraF5nbYbRz7iy",
  academyPerInstructor: "price_1UBJlo4uMHGraF5nnGIjrp0Q",
};

export async function createPlatformCheckoutSession(
  business: { id: string; name: string; email: string; platformStripeCustomerId: string | null },
  tier: "monthly" | "academy",
  instructorCount: number
) {
  const items: Stripe.Checkout.SessionCreateParams.LineItem[] =
    tier === "monthly"
      ? [{ price: PLATFORM_PRICE_IDS.monthly, quantity: 1 }]
      : [
          { price: PLATFORM_PRICE_IDS.academyBase, quantity: 1 },
          { price: PLATFORM_PRICE_IDS.academyPerInstructor, quantity: instructorCount },
        ];

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: items,
    // Reuses the same Stripe customer across attempts if one already
    // exists for this business (e.g. a retry after a cancelled
    // checkout), rather than creating a fresh, duplicate customer
    // record every single time a link is generated.
    ...(business.platformStripeCustomerId
      ? { customer: business.platformStripeCustomerId }
      : { customer_email: business.email || undefined }),
    client_reference_id: business.id,
    success_url: `${process.env.NEXTAUTH_URL}/subscription-confirmed?status=success`,
    cancel_url: `${process.env.NEXTAUTH_URL}/subscription-confirmed?status=cancelled`,
  });

  return session.url;
}
