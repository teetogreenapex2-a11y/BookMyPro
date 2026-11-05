import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";

// POST /api/personal/checkout - starts the BookMyPro Personal subscription
// on the platform's own Stripe account (not a connected account).
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const priceId = process.env.STRIPE_PERSONAL_PRICE_ID;
  if (!priceId) return NextResponse.json({ error: "Personal plan isn't set up yet." }, { status: 500 });

  const userId = (session.user as any).id as string;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (user.personalStatus === "active" || user.personalStatus === "trialing") {
    return NextResponse.json({ error: "You're already subscribed." }, { status: 400 });
  }

  let customerId = user.personalStripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({ email: user.email, name: user.name || undefined, metadata: { userId, kind: "personal" } });
    customerId = customer.id;
    await prisma.user.update({ where: { id: userId }, data: { personalStripeCustomerId: customerId } });
  }

  const origin = process.env.NEXTAUTH_URL || "https://bookmypro.app";
  // The free week is the in-app trial (no card) - checkout charges right away.
  const checkout = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    subscription_data: {
      metadata: { kind: "personal", userId },
    },
    metadata: { kind: "personal", userId },
    success_url: `${origin}/personal?subscribed=1`,
    cancel_url: `${origin}/personal`,
  });
  return NextResponse.json({ url: checkout.url });
}
