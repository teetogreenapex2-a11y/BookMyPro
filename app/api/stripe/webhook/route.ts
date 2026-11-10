import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { processStripeEvent } from "@/lib/stripeEvents";

// Stripe requires the raw request body to verify the webhook signature,
// so this route must NOT use the default JSON body parsing.
export const runtime = "nodejs";

// This endpoint stays at a single fixed URL (Stripe webhooks are registered
// per-endpoint) — every checkout session carries its businessId in metadata
// (set by /api/{slug}/packages/checkout and /api/{slug}/fittings/checkout),
// which is how each event gets routed back to the right business here.
//
// Since checkout sessions are now created as direct charges on each
// business's connected Stripe account (via the stripeAccount request
// option), these events arrive as Connect events. In the Stripe Dashboard,
// enable "Listen to events on Connected accounts" on this endpoint so it
// receives them — no separate endpoint/secret needed, they use the same
// signing secret as your platform-level events.
export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig!, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err) {
    console.error("Stripe webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  return processStripeEvent(event);
}
