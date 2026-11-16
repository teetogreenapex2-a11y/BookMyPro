import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { stripe, getAccountStatus, chargesOnPlatform, connectOpts } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { checkoutOrVenmo } from "@/lib/venmoCheckout";
import { getBusinessBySlug, getMembership } from "@/lib/tenant";
import { resolveCheckoutUser } from "@/lib/guestCheckout";
import { getBusinessAbsoluteUrl } from "@/lib/businessUrl";

const MIN_GIFT_CARD_CENTS = 1000; // $10
const MAX_GIFT_CARD_CENTS = 100000; // $1,000 — a sane ceiling against fat-finger amounts

// GET /api/{slug}/gift-cards — a player sees gift cards they've purchased
// (their own record of the code + remaining balance); the owner sees
// every gift card ever sold, for reference.
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const userId = (session.user as any).id;
  const membership = await getMembership(userId, business.id);
  const isOwner = membership?.role === "owner";

  const giftCards = await prisma.giftCard.findMany({
    where: { businessId: business.id, ...(isOwner ? {} : { purchasedByUserId: userId }) },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(giftCards);
}

// POST /api/{slug}/gift-cards  { amountCents, recipientName?, recipientEmail?, message? }
// Same "create pending, then checkout" shape as orders — the GiftCard
// record itself (and its code) only gets created once payment actually
// succeeds, in the webhook, not here. This route just starts checkout.
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);

  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });
  const body = await req.json();
  const buyer = await resolveCheckoutUser(
    session, business.id,
    { contactName: body?.buyerName, contactEmail: body?.buyerEmail, contactPhone: "" },
    { membership: false, requirePhone: false }
  );
  if ("error" in buyer) return NextResponse.json({ error: buyer.error }, { status: buyer.status });
  const isVenmo = body?.paymentMethod === "venmo";
  if (!isVenmo && !chargesOnPlatform(business) && !business.stripeAccountId) {
    return NextResponse.json({ error: "This business hasn't connected a payment account yet" }, { status: 400 });
  }
  const acctStatus = isVenmo || chargesOnPlatform(business) ? { chargesEnabled: true } : await getAccountStatus(business.stripeAccountId!);
  if (!acctStatus.chargesEnabled) {
    return NextResponse.json({ error: "This business's payment account isn't fully set up yet" }, { status: 400 });
  }

  const userId = buyer.id;
  const { amountCents, recipientName, recipientEmail, message } = body;
  const amount = Math.round(Number(amountCents));

  if (!Number.isFinite(amount) || amount < MIN_GIFT_CARD_CENTS || amount > MAX_GIFT_CARD_CENTS) {
    return NextResponse.json({ error: `Gift cards run from $${MIN_GIFT_CARD_CENTS / 100} to $${MAX_GIFT_CARD_CENTS / 100}` }, { status: 400 });
  }

  const checkoutSession = await checkoutOrVenmo(
    {
      mode: "payment",
      payment_method_types: ["card", "klarna"],
      customer_email: buyer.email || undefined,
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: { name: `Gift Card — ${business.name}` },
            unit_amount: amount,
          },
          quantity: 1,
        },
      ],
      metadata: {
        kind: "gift_card",
        businessId: business.id,
        userId,
        amountCents: String(amount),
        recipientName: recipientName?.trim() || "",
        recipientEmail: recipientEmail?.trim() || "",
        message: message?.trim().slice(0, 500) || "",
      },
      success_url: getBusinessAbsoluteUrl(req, business.slug, "/gift-cards?purchase=success"),
      cancel_url: getBusinessAbsoluteUrl(req, business.slug, "/gift-cards?purchase=cancelled"),
    },
    connectOpts(business),
    { venmo: isVenmo, business, userId, userEmail: buyer.email }
  );
  if (checkoutSession.error) return NextResponse.json({ error: checkoutSession.error }, { status: 400 });
  if (checkoutSession.venmo) return NextResponse.json({ venmo: checkoutSession.venmo });

  return NextResponse.json({ checkoutUrl: checkoutSession.url });
}
