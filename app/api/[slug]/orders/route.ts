import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { stripe, getAccountStatus } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug, getMembership } from "@/lib/tenant";
import { getBusinessAbsoluteUrl } from "@/lib/businessUrl";
import { findRedeemableGiftCard, redeemGiftCard } from "@/lib/giftCards";

// GET /api/{slug}/orders — a player sees their own; the owner sees every
// order, for fulfillment.
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const userId = (session.user as any).id;
  const membership = await getMembership(userId, business.id);
  const isOwner = membership?.role === "owner";

  const orders = await prisma.order.findMany({
    where: { businessId: business.id, ...(isOwner ? {} : { buyerId: userId }) },
    include: { items: { include: { product: true, variant: true } }, buyer: { select: { name: true, email: true } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(orders);
}

// POST /api/{slug}/orders  { items: [{productId, variantId?, quantity}], fulfillmentType, shippingName?, shippingAddress?, contactPhone?, contactEmail?, giftCardCode? }
// Creates a pending Order + its items first (rather than putting the whole
// cart in Stripe's metadata, which has a size limit that a multi-item cart
// could realistically hit), then a Stripe Checkout session referencing
// that order by ID. Stock is validated and reserved here, before payment —
// if checkout is abandoned, stock stays reserved against a pending order
// rather than being sold twice, which is the safer failure mode for a
// small shop with limited inventory.
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });
  if (!business.stripeAccountId) {
    return NextResponse.json({ error: "This business hasn't connected a payment account yet" }, { status: 400 });
  }
  const acctStatus = await getAccountStatus(business.stripeAccountId);
  if (!acctStatus.chargesEnabled) {
    return NextResponse.json({ error: "This business's payment account isn't fully set up yet" }, { status: 400 });
  }

  const userId = (session.user as any).id;
  const { items, fulfillmentType, shippingName, shippingAddress, contactPhone, contactEmail, giftCardCode } = await req.json();

  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "Your cart is empty" }, { status: 400 });
  }
  if (fulfillmentType !== "pickup" && fulfillmentType !== "shipping") {
    return NextResponse.json({ error: "Choose pickup or shipping" }, { status: 400 });
  }
  if (fulfillmentType === "shipping" && (!shippingName?.trim() || !shippingAddress?.trim())) {
    return NextResponse.json({ error: "A shipping name and address are required" }, { status: 400 });
  }

  // Validate every item and compute the real total server-side — never
  // trust a price the client sent.
  let totalCents = 0;
  const resolvedItems: { productId: string; variantId: string | null; quantity: number; priceCentsAtPurchase: number }[] = [];

  for (const item of items) {
    const product = await prisma.product.findFirst({
      where: { id: item.productId, businessId: business.id, enabled: true },
      include: { variants: true },
    });
    if (!product) return NextResponse.json({ error: "One of the items in your cart is no longer available" }, { status: 400 });

    const quantity = Math.max(1, Math.floor(Number(item.quantity) || 1));

    if (product.variants.length > 0) {
      const variant = product.variants.find((v) => v.id === item.variantId);
      if (!variant) return NextResponse.json({ error: `Choose an option for ${product.name}` }, { status: 400 });
      if (variant.stockQuantity < quantity) {
        return NextResponse.json({ error: `Only ${variant.stockQuantity} left of ${product.name} (${variant.label})` }, { status: 400 });
      }
      resolvedItems.push({ productId: product.id, variantId: variant.id, quantity, priceCentsAtPurchase: product.priceCents });
    } else {
      if (product.stockQuantity !== null && product.stockQuantity < quantity) {
        return NextResponse.json({ error: `Only ${product.stockQuantity} left of ${product.name}` }, { status: 400 });
      }
      resolvedItems.push({ productId: product.id, variantId: null, quantity, priceCentsAtPurchase: product.priceCents });
    }
    totalCents += product.priceCents * quantity;
  }

  // Reserve stock now, before payment — decremented here, restored if the
  // order later gets cancelled.
  for (const item of resolvedItems) {
    if (item.variantId) {
      await prisma.productVariant.update({ where: { id: item.variantId }, data: { stockQuantity: { decrement: item.quantity } } });
    } else {
      const product = await prisma.product.findUnique({ where: { id: item.productId } });
      if (product?.stockQuantity !== null && product?.stockQuantity !== undefined) {
        await prisma.product.update({ where: { id: item.productId }, data: { stockQuantity: { decrement: item.quantity } } });
      }
    }
  }

  const order = await prisma.order.create({
    data: {
      businessId: business.id,
      buyerId: userId,
      fulfillmentType,
      shippingName: shippingName?.trim() || null,
      shippingAddress: shippingAddress?.trim() || null,
      contactPhone: contactPhone?.trim() || null,
      contactEmail: contactEmail?.trim() || null,
      totalCents,
      items: { create: resolvedItems },
    },
  });

  // Apply a gift card, if one was given — reduces what actually needs to
  // be charged on the card. If it covers the whole order, skip Stripe
  // entirely and mark it paid immediately.
  let remainingCents = totalCents;
  if (giftCardCode) {
    const giftCard = await findRedeemableGiftCard(business.id, giftCardCode);
    if (!giftCard) return NextResponse.json({ error: "That gift card code isn't valid" }, { status: 400 });
    const applied = await redeemGiftCard(giftCard.id, totalCents, { orderId: order.id });
    remainingCents -= applied;
    await prisma.order.update({ where: { id: order.id }, data: { giftCardAppliedCents: applied } });
  }

  if (remainingCents <= 0) {
    await prisma.order.update({ where: { id: order.id }, data: { status: "paid" } });
    return NextResponse.json({ order, checkoutUrl: null, paidWithGiftCard: true });
  }

  const checkoutSession = await stripe.checkout.sessions.create(
    {
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: session.user?.email || undefined,
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: { name: `Order at ${business.name}${order.giftCardAppliedCents > 0 ? " (after gift card)" : ""}` },
            unit_amount: remainingCents,
          },
          quantity: 1,
        },
      ],
      metadata: { kind: "order", orderId: order.id, businessId: business.id },
      success_url: getBusinessAbsoluteUrl(req, business.slug, "/shop?purchase=success"),
      cancel_url: getBusinessAbsoluteUrl(req, business.slug, "/shop?purchase=cancelled"),
    },
    { stripeAccount: business.stripeAccountId }
  );

  await prisma.order.update({ where: { id: order.id }, data: { stripeSessionId: checkoutSession.id } });

  return NextResponse.json({ order, checkoutUrl: checkoutSession.url });
}
