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

// Stripe API version for the v2 Core Accounts REST call below - separate
// from the v1 `apiVersion` on the SDK client above, since v1 and v2 are
// versioned independently.
const STRIPE_V2_VERSION = "2026-08-26.dahlia";

export async function createConnectedAccount(email: string) {
  // This platform's Connect setup no longer allows creating accounts
  // through the v1 Accounts API at all (every combination of the old
  // `type`/`controller` fields got rejected, ending with Stripe's own
  // message to switch to Accounts v2) - so this calls the v2 REST endpoint
  // directly. stripe-node@16 (the version installed here) has no v2 client,
  // hence the raw fetch rather than an SDK method.
  //
  // dashboard: "express" + fees_collector/losses_collector: "application" is
  // v2's equivalent of the old `type: "express"` Express account: your
  // platform (not Stripe) is on the hook for a connected account's negative
  // balance, same as before. See
  // https://docs.stripe.com/connect/accounts-v2/connected-account-configuration
  const res = await fetch("https://api.stripe.com/v2/core/accounts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      "Stripe-Version": STRIPE_V2_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contact_email: email,
      dashboard: "express",
      configuration: {
        merchant: {
          // Requesting card_payments is enough - v2 auto-activates payout
          // capability (`stripe_balance.payouts`) alongside it, there's no
          // separate "transfers" capability to request like in v1.
          capabilities: {
            card_payments: { requested: true },
          },
        },
      },
      defaults: {
        responsibilities: {
          fees_collector: "application",
          losses_collector: "application",
        },
      },
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    const err: any = new Error(data?.error?.message || "Failed to create Stripe account");
    err.code = data?.error?.code;
    err.type = data?.error?.type;
    err.raw = data?.error;
    throw err;
  }
  return data.id as string;
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

// True when Stripe is saying the platform's API key simply can't reach this
// connected account anymore - the merchant disconnected the app from their
// own Stripe dashboard, or the account was closed. Not a transient failure:
// retrying with the same account id will keep failing, so callers should
// treat this as "the stored account id is dead" rather than "try again".
export function isAccountAccessError(err: any) {
  return err?.code === "account_invalid" || err?.type === "StripePermissionError";
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
