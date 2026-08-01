import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { stripe, getAccountStatus } from "@/lib/stripe";
import { createSquarePaymentLink } from "@/lib/square";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug } from "@/lib/tenant";
import { getBusinessAbsoluteUrl } from "@/lib/businessUrl";

// POST /api/{slug}/groups/checkout  { availabilityId, contactName, contactPhone, contactEmail }
// Joining a group lesson - pay-per-session, no package/credit involved at
// all. The actual Booking record is only created once payment succeeds
// (see stripe/webhook or square/webhook), same pattern as fittings - so a
// spot is never held for someone mid-checkout who never finishes paying.
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const { availabilityId, contactName, contactPhone, contactEmail } = await req.json();

  if (!contactName?.trim() || !contactPhone?.trim() || !contactEmail?.trim()) {
    return NextResponse.json({ error: "Name, phone, and email are required" }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
    return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
  }

  const slot = await prisma.availability.findFirst({
    where: { id: availabilityId, businessId: business.id },
    include: { bookings: { where: { status: { not: "cancelled" } } } },
  });
  if (!slot || !slot.isGroup || !slot.groupCapacity || slot.groupPriceCents == null) {
    return NextResponse.json({ error: "That isn't a group session" }, { status: 400 });
  }
  if (slot.status === "closed") {
    return NextResponse.json({ error: "That session is no longer available" }, { status: 409 });
  }
  if (slot.bookings.length >= slot.groupCapacity) {
    return NextResponse.json({ error: "That session is full" }, { status: 409 });
  }

  const userId = (session.user as any).id;
  const priceCents = slot.groupPriceCents;

  if (business.paymentProvider === "square") {
    if (!business.squareAccessToken) {
      return NextResponse.json({ error: "This business hasn't set up payments yet" }, { status: 400 });
    }

    const pending = await prisma.pendingSquarePayment.create({
      data: {
        businessId: business.id,
        userId,
        kind: "group",
        availabilityId,
        instructorMembershipId: slot.instructorMembershipId,
        contactName: contactName.trim(),
        contactPhone: contactPhone.trim(),
        contactEmail: contactEmail.trim(),
      },
    });

    try {
      const url = await createSquarePaymentLink(business.squareAccessToken, {
        amountCents: priceCents,
        name: `Group lesson — ${business.name}`,
        referenceId: pending.id,
        redirectUrl: getBusinessAbsoluteUrl(req, business.slug, "/book?purchase=success"),
      });
      return NextResponse.json({ url });
    } catch (e) {
      await prisma.pendingSquarePayment.delete({ where: { id: pending.id } }).catch(() => {});
      console.error("Square payment link creation failed:", e);
      return NextResponse.json({ error: "Couldn't start checkout — try again" }, { status: 500 });
    }
  }

  // Default: Stripe.
  if (!business.stripeAccountId) {
    return NextResponse.json({ error: "This business hasn't set up payments yet" }, { status: 400 });
  }
  const acctStatus = await getAccountStatus(business.stripeAccountId);
  if (!acctStatus.chargesEnabled) {
    return NextResponse.json({ error: "This business hasn't finished setting up payments yet" }, { status: 400 });
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
            product_data: { name: `Group lesson — ${business.name}` },
            unit_amount: priceCents,
          },
          quantity: 1,
        },
      ],
      metadata: {
        kind: "group",
        userId,
        businessId: business.id,
        availabilityId,
        instructorMembershipId: slot.instructorMembershipId,
        contactName: contactName.trim(),
        contactPhone: contactPhone.trim(),
        contactEmail: contactEmail.trim(),
      },
      success_url: getBusinessAbsoluteUrl(req, business.slug, "/book?purchase=success"),
      cancel_url: getBusinessAbsoluteUrl(req, business.slug, "/book?purchase=cancelled"),
    },
    { stripeAccount: business.stripeAccountId }
  );

  return NextResponse.json({ url: checkoutSession.url });
}
