import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { stripe, getAccountStatus } from "@/lib/stripe";
import { createSquarePaymentLink } from "@/lib/square";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug, getInstructorById } from "@/lib/tenant";
import { getBusinessAbsoluteUrl } from "@/lib/businessUrl";
import { findFitting, getFittingPriceCents, isFittingEnabled } from "@/lib/pricing";

// POST /api/{slug}/fittings/checkout  { availabilityId, fittingType }
// The Booking record itself is only created once payment succeeds (see
// stripe/webhook or square/webhook), so a fitting slot is never held
// "booked" for an unpaid checkout attempt. Routes to Stripe or Square
// depending on which payment provider the business has connected.
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const { availabilityId, fittingType, instructorMembershipId, contactName, contactPhone, contactEmail } = await req.json();
  const fitting = findFitting(fittingType);
  if (!fitting) return NextResponse.json({ error: "Unknown fitting type" }, { status: 400 });

  if (!contactName?.trim() || !contactPhone?.trim() || !contactEmail?.trim()) {
    return NextResponse.json({ error: "Name, phone, and email are required" }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
    return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
  }
  if (!instructorMembershipId) {
    return NextResponse.json({ error: "Choose which instructor you're booking with" }, { status: 400 });
  }
  const instructorMembership = await getInstructorById(business.id, instructorMembershipId);
  if (!instructorMembership) {
    return NextResponse.json({ error: "That instructor isn't available at this business" }, { status: 400 });
  }

  // businessId scoping is what stops someone from booking a fitting slot
  // that belongs to a different business by guessing/reusing an id.
  const slot = await prisma.availability.findFirst({
    where: { id: availabilityId, businessId: business.id },
  });
  if (!slot || slot.status !== "open") {
    return NextResponse.json({ error: "That slot is no longer available" }, { status: 409 });
  }
  if (slot.instructorMembershipId !== instructorMembershipId) {
    return NextResponse.json({ error: "That slot belongs to a different instructor's calendar" }, { status: 400 });
  }

  // Pricing is per-instructor now, not business-wide.
  if (!isFittingEnabled(instructorMembership, fitting.id)) {
    return NextResponse.json({ error: "This fitting type isn't currently offered by this instructor" }, { status: 400 });
  }
  const priceCents = getFittingPriceCents(instructorMembership, fitting.id);
  const userId = (session.user as any).id;

  if (business.paymentProvider === "square") {
    if (!business.squareAccessToken) {
      return NextResponse.json({ error: "This business hasn't set up payments yet" }, { status: 400 });
    }

    const pending = await prisma.pendingSquarePayment.create({
      data: {
        businessId: business.id,
        userId,
        kind: "fitting",
        availabilityId,
        instructorMembershipId,
        fittingType: fitting.id,
        contactName: contactName.trim(),
        contactPhone: contactPhone.trim(),
        contactEmail: contactEmail.trim(),
      },
    });

    try {
      const url = await createSquarePaymentLink(business.squareAccessToken, {
        amountCents: priceCents,
        name: `${fitting.label} — ${business.name}`,
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

  // Created as a "direct charge" on the connected account (via the
  // stripeAccount request option) — the business is the merchant of record
  // and the money lands directly in their account, not the platform's.
  const checkoutSession = await stripe.checkout.sessions.create(
    {
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: session.user?.email || undefined,
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: { name: `${fitting.label} — ${business.name}` },
            unit_amount: priceCents,
          },
          quantity: 1,
        },
      ],
      metadata: {
        kind: "fitting",
        userId,
        businessId: business.id,
        availabilityId,
        instructorMembershipId,
        fittingType: fitting.id,
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
