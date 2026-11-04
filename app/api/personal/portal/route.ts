import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";

// POST /api/personal/portal - Stripe's hosted page to cancel / update card.
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const user = await prisma.user.findUnique({ where: { id: (session.user as any).id } });
  if (!user?.personalStripeCustomerId) return NextResponse.json({ error: "No billing yet." }, { status: 400 });
  const origin = process.env.NEXTAUTH_URL || "https://bookmypro.app";
  const portal = await stripe.billingPortal.sessions.create({
    customer: user.personalStripeCustomerId,
    return_url: `${origin}/personal`,
  });
  return NextResponse.json({ url: portal.url });
}
