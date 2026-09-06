import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { stripe, getAccountStatus } from "@/lib/stripe";
import { createSquarePaymentLink } from "@/lib/square";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug } from "@/lib/tenant";
import { getBusinessAbsoluteUrl } from "@/lib/businessUrl";

// GET /api/{slug}/groups
// No auth needed, same as the main availability route - the booking page
// needs this to show upcoming group lessons before a player has even
// picked an instructor, so it can't be scoped to one instructor the way
// the calendar itself is.
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const slots = await prisma.availability.findMany({
    where: {
      businessId: business.id,
      isGroup: true,
      status: "open", // excludes full and closed - only genuinely joinable sessions show here
      startTime: { gte: new Date() },
      instructor: { hiddenFromBooking: false },
    },
    include: {
      instructor: { include: { user: { select: { name: true } } } },
      bookings: { where: { status: { not: "cancelled" } } },
    },
    orderBy: { startTime: "asc" },
  });

  return NextResponse.json(
    slots.map((s) => ({
      id: s.id,
      startTime: s.startTime,
      instructorMembershipId: s.instructorMembershipId,
      instructorName: s.instructor.user.name || "Your pro",
      groupCapacity: s.groupCapacity,
      groupPriceCents: s.groupPriceCents,
      groupSpotsTaken: s.bookings.length,
    }))
  );
}

// POST /api/{slug}/groups/checkout  { availabilityId, contactName?, contactPhone?, contactEmail? }
//
// This route's real job, previously missing entirely - a duplicate copy
// of the GET handler above sat here instead. Routes to Stripe or Square
// depending on which the business has connected, same pattern as
// packages/checkout. Both webhooks already have complete "kind: group"
// handling built and ready on the receiving end (re-checking capacity at
// payment time, since two people could be checking out for the last spot
// at nearly the same moment) - this was the only missing piece.
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const { availabilityId, contactName, contactPhone, contactEmail } = await req.json();
  if (!availabilityId) return NextResponse.json({ error: "Pick a session first" }, { status: 400 });

  const slot = await prisma.availability.findFirst({
    where: { id: availabilityId, businessId: business.id, isGroup: true },
    include: { instructor: { include: { user: { select: { name: true } } } }, bookings: { where: { status: { not: "cancelled" } } } },
  });
  if (!slot) return NextResponse.json({ error: "That session isn't available anymore" }, { status: 404 });
  if (!slot.groupCapacity || slot.bookings.length >= slot.groupCapacity) {
    return NextResponse.json({ error: "That session is already full" }, { status: 400 });
  }
  if (!slot.groupPriceCents) return NextResponse.json({ error: "This session isn't priced yet" }, { status: 400 });

  const userId = (session.user as any).id;
  const label = `Group lesson with ${slot.instructor.user.name || "your pro"}`;

  if (business.paymentProvider === "square") {
    if (!business.squareAccessToken) {
      return NextResponse.json({ error: "This business hasn't set up payments yet" }, { status: 400 });
    }

    const pending = await prisma.pendingSquarePayment.create({
      data: {
        businessId: business.id,
        userId,
        kind: "group",
        availabilityId: slot.id,
        instructorMembershipId: slot.instructorMembershipId,
        contactName: contactName?.trim() || null,
        contactPhone: contactPhone?.trim() || null,
        contactEmail: contactEmail?.trim() || null,
      },
    });

    try {
      const url = await createSquarePaymentLink(business.squareAccessToken, {
        amountCents: slot.groupPriceCents,
        name: `${label} — ${business.name}`,
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
            product_data: { name: `${label} — ${business.name}` },
            unit_amount: slot.groupPriceCents,
          },
          quantity: 1,
        },
      ],
      metadata: {
        kind: "group",
        userId,
        businessId: business.id,
        availabilityId: slot.id,
        instructorMembershipId: slot.instructorMembershipId || "",
        contactName: contactName?.trim() || "",
        contactPhone: contactPhone?.trim() || "",
        contactEmail: contactEmail?.trim() || "",
      },
      success_url: getBusinessAbsoluteUrl(req, business.slug, "/book?purchase=success"),
      cancel_url: getBusinessAbsoluteUrl(req, business.slug, "/book?purchase=cancelled"),
    },
    { stripeAccount: business.stripeAccountId }
  );

  return NextResponse.json({ url: checkoutSession.url });
}

