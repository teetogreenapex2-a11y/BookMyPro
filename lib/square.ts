// Square client — mirrors lib/stripe.ts's Connect pattern so each business
// can connect their own Square seller account instead of (or as well as)
// Stripe. See README §2 for setup steps (Square Developer Dashboard, app
// credentials, sandbox vs production).
//
// NOTE: this is written against Square's documented OAuth + Payment Links +
// Webhooks APIs as of this writing. Square evolves its API surface
// regularly — before going live, diff this against the current API
// reference at https://developer.squareup.com/reference/square, since exact
// field names (particularly Order/Payment Link metadata fields) are worth
// double-checking against the live docs rather than trusting this blind.

const SQUARE_ENV = process.env.SQUARE_ENVIRONMENT === "production" ? "production" : "sandbox";
const SQUARE_API_BASE = SQUARE_ENV === "production" ? "https://connect.squareup.com" : "https://connect.squareupsandbox.com";
const SQUARE_OAUTH_BASE = SQUARE_ENV === "production" ? "https://connect.squareup.com" : "https://connect.squareupsandbox.com";
const SQUARE_API_VERSION = "2024-06-04"; // pin a known-working version; bump deliberately after testing

const APP_ID = process.env.SQUARE_APPLICATION_ID;
const APP_SECRET = process.env.SQUARE_APPLICATION_SECRET;

if (!APP_ID || !APP_SECRET) {
  console.warn("SQUARE_APPLICATION_ID / SQUARE_APPLICATION_SECRET are not set — Square calls will fail until they are.");
}

// Step 1: the URL a business owner/instructor visits to authorize this app
// against their own Square seller account. `state` carries the businessId
// through the OAuth round-trip, same pattern as the Google Calendar connect
// flow — the callback URL is fixed and can't be per-business.
export function getSquareAuthUrl(state: string) {
  const scopes = ["MERCHANT_PROFILE_READ", "PAYMENTS_WRITE", "PAYMENTS_READ", "ORDERS_WRITE", "ORDERS_READ"];
  const params = new URLSearchParams({
    client_id: APP_ID || "",
    scope: scopes.join(" "),
    session: "false",
    state,
  });
  return `${SQUARE_OAUTH_BASE}/oauth2/authorize?${params.toString()}`;
}

// Step 2: exchange the ?code=... callback param for tokens.
export async function exchangeSquareCode(code: string) {
  const res = await fetch(`${SQUARE_API_BASE}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Square-Version": SQUARE_API_VERSION },
    body: JSON.stringify({
      client_id: APP_ID,
      client_secret: APP_SECRET,
      code,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`Square token exchange failed: ${await res.text()}`);
  const data = await res.json();
  return {
    accessToken: data.access_token as string,
    refreshToken: data.refresh_token as string,
    merchantId: data.merchant_id as string,
    expiresAt: new Date(data.expires_at as string),
  };
}

// Square access tokens expire (30 days) and Square recommends refreshing
// well before that — see the cron job in app/api/cron/square-token-refresh.
export async function refreshSquareToken(refreshToken: string) {
  const res = await fetch(`${SQUARE_API_BASE}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Square-Version": SQUARE_API_VERSION },
    body: JSON.stringify({
      client_id: APP_ID,
      client_secret: APP_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Square token refresh failed: ${await res.text()}`);
  const data = await res.json();
  return {
    accessToken: data.access_token as string,
    refreshToken: data.refresh_token as string,
    expiresAt: new Date(data.expires_at as string),
  };
}

// Creates a Square-hosted Payment Link (their equivalent of a Stripe
// Checkout Session) — the customer pays on a Square page, then gets
// redirected back. `referenceId` is how we recognize the payment later in
// the webhook (encode businessId/kind/etc into it — see the checkout routes).
export async function createSquarePaymentLink(
  accessToken: string,
  {
    amountCents,
    name,
    referenceId,
    redirectUrl,
  }: { amountCents: number; name: string; referenceId: string; redirectUrl: string }
) {
  const locationId = await getFirstLocationId(accessToken);

  const res = await fetch(`${SQUARE_API_BASE}/v2/online-checkout/payment-links`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Square-Version": SQUARE_API_VERSION,
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      idempotency_key: `${referenceId}-${Date.now()}`,
      order: {
        location_id: locationId,
        // reference_id round-trips onto the resulting Order — the webhook
        // reads it back to know which booking/package this payment was for.
        reference_id: referenceId,
        line_items: [
          {
            name,
            quantity: "1",
            base_price_money: { amount: amountCents, currency: "USD" },
          },
        ],
      },
      checkout_options: { redirect_url: redirectUrl },
    }),
  });
  if (!res.ok) throw new Error(`Square payment link creation failed: ${await res.text()}`);
  const data = await res.json();
  return data.payment_link?.url as string;
}

async function getFirstLocationId(accessToken: string) {
  const res = await fetch(`${SQUARE_API_BASE}/v2/locations`, {
    headers: { "Square-Version": SQUARE_API_VERSION, Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Square locations lookup failed: ${await res.text()}`);
  const data = await res.json();
  return data.locations?.[0]?.id as string;
}

// Fetches an Order by id, using the connected business's own access token
// (webhook payloads don't carry enough to authenticate as the merchant
// directly, so the webhook handler looks up the business by merchant_id
// first, then uses *their* stored token to make this call).
export async function getSquareOrder(accessToken: string, orderId: string) {
  const res = await fetch(`${SQUARE_API_BASE}/v2/orders/${orderId}`, {
    headers: { "Square-Version": SQUARE_API_VERSION, Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Square order lookup failed: ${await res.text()}`);
  const data = await res.json();
  return data.order as { id: string; reference_id?: string };
}

// Verifies a Square webhook's signature. Square signs with HMAC-SHA256 over
// (notification URL + raw body), base64-encoded, in the
// `x-square-hmacsha256-signature` header.
export async function verifySquareWebhookSignature(rawBody: string, signature: string, notificationUrl: string) {
  const crypto = await import("crypto");
  const key = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY || "";
  const hmac = crypto.createHmac("sha256", key);
  hmac.update(notificationUrl + rawBody);
  const expected = hmac.digest("base64");
  return expected === signature;
}
