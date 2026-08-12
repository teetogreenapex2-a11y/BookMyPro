import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { stripe, getAccountStatus } from "@/lib/stripe";
import { createSquarePaymentLink } from "@/lib/square";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug, getInstructorById } from "@/lib/tenant";
import { getBusinessAbsoluteUrl } from "@/lib/businessUrl";
import { findPackage, getPackagePriceCents, isPackageEnabled, isPackagePriceSet } from "@/lib/pricing";

// POST /api/{slug}/packages/deposit  { packageType, availabilityId?, contactName, contactPhone, contactEmail }
// Replaces the old, zero-upfront "pay at first lesson" option - this
// genuinely charges half the price right now through the same real
// checkout flow as a normal purchase, with the other half tracked as an
// actual balance owed, collected in person at the first lesson. The real
// money upfront is the whole point: it's what actually keeps someone
// committed to a booking rather than treating the calendar as something
// to hold with no real stake in it.
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  if (!business.allowPayLater) {
    return NextResponse.json({ error: "This business doesn't offer a deposit option" }, { status: 400 });
  }

  const { packageType, availabilityId, instructorMembershipId, contactName, contactPhone, contactEmail, isRemote: submittedIsRemote } = await req.json();
  if (!contactName?.trim() || !contactPhone?.trim() || !contactEmail?.trim()) {
    return NextResponse.json({ error: "Name, phone, and email are all required" }, { status: 400 });
  }
  const pkg = findPackage(packageType);
  if (!pkg) return NextResponse.json({ error: "Unknown package type" }, { status: 400 });
  if (pkg.id === "video" && !business.dailyApiKey) {
    return NextResponse.json({ error: "This business hasn't set up remote lessons yet" }, { status: 400 });
  }
  const isRemote = pkg.id === "video" || !!submittedIsRemote;

  if (!instructorMembershipId) {
    return NextResponse.json({ error: "Choose which instructor you're booking with" }, { status: 400 });
  }
  const instructorMembership = await getInstructorById(business.id, instructorMembershipId);
  if (!instructorMembership) {
    return NextResponse.json({ error: "That instructor isn't available at this business" }, { status: 400 });
  }
  if (!isPackageEnabled(instructorMembership, pkg.id)) {
    return NextResponse.json({ error: "This package isn't currently offered by this instructor" }, { status: 400 });
  }
  if (!isPackagePriceSet(instructorMembership, pkg.id)) {
    return NextResponse.json({ error: "This package doesn't have a price set yet — contact the business" }, { status: 400 });
  }

  if (availabilityId) {
    const slot = await prisma.availability.findFirst({ where: { id: availabilityId, businessId: business.id } });
    if (!slot || slot.status !== "open") {
      return NextResponse.json({ error: "That slot is no longer available" }, { status: 409 });
    }
    if (slot.instructorMembershipId !== instructorMembershipId) {
      return NextResponse.json({ error: "That slot belongs to a different instructor's calendar" }, { status: 400 });
    }
  }

  const fullPriceCents = getPackagePriceCents(instructorMembership, pkg.id);
  // Rounds the deposit down and the remaining balance up by a cent when
  // the price is odd, rather than the other way around - collecting a
  // possible extra cent in person is a lot less awkward than a checkout
  // page trying to charge half a cent.
  const depositCents = Math.floor(fullPriceCents / 2);
  const userId = (session.user as any).id;

  if (business.paymentProvider === "square") {
    if (!business.squareAccessToken) {
      return NextResponse.json({ error: "This business hasn't set up payments yet" }, { status: 400 });
    }

    const pending = await prisma.pendingSquarePayment.create({
      data: {
        businessId: business.id,
        userId,
        kind: "package_deposit",
        packageType: pkg.id,
        availabilityId: availabilityId || null,
        instructorMembershipId: instructorMembershipId || null,
        contactName: contactName?.trim() || null,
        contactPhone: contactPhone?.trim() || null,
        contactEmail: contactEmail?.trim() || null,
        isRemote,
        fullPriceCents,
      },
    });

    try {
      const url = await createSquarePaymentLink(business.squareAccessToken, {
        amountCents: depositCents,
        name: `${pkg.label} deposit — ${business.name}`,
        referenceId: pending.id,
        redirectUrl: getBusinessAbsoluteUrl(req, business.slug, "/book?purchase=success"),
      });
      return NextResponse.json({ url });
    } catch (e) {
      await prisma.pendingSquarePayment.delete({ where: { id: pending.id } }).catch(() => {});
      console.error("Square deposit payment link creation failed:", e);
      return NextResponse.json({ error: "Couldn't start checkout — try again" }, { status: 500 });
    }
  }

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
            product_data: { name: `${pkg.label} deposit — ${business.name}` },
            unit_amount: depositCents,
          },
          quantity: 1,
        },
      ],
      metadata: {
        kind: "package_deposit",
        userId,
        businessId: business.id,
        packageType: pkg.id,
        fullPriceCents: String(fullPriceCents),
        availabilityId: availabilityId || "",
        instructorMembershipId: instructorMembershipId || "",
        contactName: contactName?.trim() || "",
        contactPhone: contactPhone?.trim() || "",
        contactEmail: contactEmail?.trim() || "",
        isRemote: isRemote ? "true" : "",
      },
      success_url: getBusinessAbsoluteUrl(req, business.slug, "/book?purchase=success"),
      cancel_url: getBusinessAbsoluteUrl(req, business.slug, "/book?purchase=cancelled"),
    },
    { stripeAccount: business.stripeAccountId }
  );

  return NextResponse.json({ url: checkoutSession.url });
}
