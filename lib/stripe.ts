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
