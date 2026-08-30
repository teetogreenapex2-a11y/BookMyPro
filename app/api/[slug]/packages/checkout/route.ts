import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { stripe, getAccountStatus } from "@/lib/stripe";
import { createSquarePaymentLink } from "@/lib/square";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug, getInstructorById } from "@/lib/tenant";
import { getBusinessAbsoluteUrl } from "@/lib/businessUrl";
import { findPackage, getPackagePriceCents, isPackageEnabled, isPackagePriceSet, resolveDurationPurchase } from "@/lib/pricing";

// POST /api/{slug}/packages/checkout  { packageType, availabilityId?, contactName?, contactPhone?, contactEmail? }
// Routes to Stripe or Square depending on which payment provider the
// business has connected (business.paymentProvider). If availabilityId is
// given, that slot is carried through checkout in the metadata — once
// payment succeeds, the webhook creates the package AND books that slot
// with the first credit in one step, so the player picks their time before
// paying rather than buying a package with no slot attached yet.
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const { packageType, durationId, packageOptionId, availabilityId, instructorMembershipId, contactName, contactPhone, contactEmail, isRemote: submittedIsRemote } = await req.json();

  // Pricing is per-instructor now, not business-wide — every package
  // purchase needs to know who it's with in order to know what to charge,
  // for either path below.
  if (!instructorMembershipId) {
    return NextResponse.json({ error: "Choose which instructor you're booking with" }, { status: 400 });
  }
  const instructorMembership = await getInstructorById(business.id, instructorMembershipId);
  if (!instructorMembership) {
    return NextResponse.json({ error: "That instructor isn't available at this business" }, { status: 400 });
  }

  // What's actually being purchased - resolved into one common shape
  // either way, so everything below (slot check, Stripe/Square session
  // creation) doesn't need to know or care which path produced it.
  let purchase: { label: string; priceCents: number; lessonsTotal: number; packageTypeForDb: string; packageOptionIdForDb: string | null; durationMinutesForDb: number | null; durationLabelForDb: string | null; isRemote: boolean };

  if (durationId) {
    // The new, instructor-defined lesson-length system (see
    // LessonDuration/LessonPackageOption in schema.prisma) - only used
    // once an instructor has actually set up durations of their own;
    // the packageType path below is untouched and remains the fallback
    // for every instructor who hasn't.
    const durations = await prisma.lessonDuration.findMany({
      where: { membershipId: instructorMembershipId },
      include: { packages: true },
    });
    const resolved = resolveDurationPurchase(durations, durationId, packageOptionId || null);
    if (!resolved) {
      return NextResponse.json({ error: "That lesson option is no longer available" }, { status: 400 });
    }
    const baseLabel = resolved.label ? `${resolved.label} (${resolved.minutes} min)` : `${resolved.minutes}-min lesson`;
    purchase = {
      label: resolved.lessonsTotal > 1 ? `${baseLabel} - ${resolved.lessonsTotal}-pack` : baseLabel,
      priceCents: resolved.priceCents,
      lessonsTotal: resolved.lessonsTotal,
      packageTypeForDb: "duration",
      packageOptionIdForDb: resolved.packageOptionId,
      durationMinutesForDb: resolved.minutes,
      durationLabelForDb: resolved.label,
      isRemote: !!submittedIsRemote,
    };
  } else {
    const pkg = findPackage(packageType);
    if (!pkg) return NextResponse.json({ error: "Unknown package type" }, { status: 400 });
    if (pkg.id === "video" && !business.dailyApiKey) {
      return NextResponse.json({ error: "This business hasn't set up remote lessons yet" }, { status: 400 });
    }
    if (!isPackageEnabled(instructorMembership, pkg.id)) {
      return NextResponse.json({ error: "This package isn't currently offered by this instructor" }, { status: 400 });
    }
    if (!isPackagePriceSet(instructorMembership, pkg.id)) {
      return NextResponse.json({ error: "This package doesn't have a price set yet — contact the business" }, { status: 400 });
    }
    purchase = {
      label: pkg.label,
      priceCents: getPackagePriceCents(instructorMembership, pkg.id),
      lessonsTotal: pkg.lessons,
      packageTypeForDb: pkg.id,
      packageOptionIdForDb: null,
      durationMinutesForDb: null,
      durationLabelForDb: null,
      // The "video" package is inherently remote regardless of what the
      // client sent — derived server-side so this can't be spoofed or forgotten.
      isRemote: pkg.id === "video" || !!submittedIsRemote,
    };
  }
  const isRemote = purchase.isRemote;

  // If a slot was picked, confirm it's still real and open before sending
  // the player to pay — scoped by businessId so an id from a different
  // business can never match here.
  if (availabilityId) {
    const slot = await prisma.availability.findFirst({ where: { id: availabilityId, businessId: business.id } });
    if (!slot || slot.status !== "open") {
      return NextResponse.json({ error: "That slot is no longer available" }, { status: 409 });
    }
    if (slot.instructorMembershipId !== instructorMembershipId) {
      return NextResponse.json({ error: "That slot belongs to a different instructor's calendar" }, { status: 400 });
    }
  }

  const priceCents = purchase.priceCents;
  const userId = (session.user as any).id;

  if (business.paymentProvider === "square") {
    if (!business.squareAccessToken) {
      return NextResponse.json({ error: "This business hasn't set up payments yet" }, { status: 400 });
    }

    const pending = await prisma.pendingSquarePayment.create({
      data: {
        businessId: business.id,
        userId,
        kind: "package",
        packageType: purchase.packageTypeForDb,
        packageOptionId: purchase.packageOptionIdForDb,
        durationMinutes: purchase.durationMinutesForDb,
        durationLabel: purchase.durationLabelForDb,
        lessonsTotal: purchase.lessonsTotal,
        availabilityId: availabilityId || null,
        instructorMembershipId: instructorMembershipId || null,
        contactName: contactName?.trim() || null,
        contactPhone: contactPhone?.trim() || null,
        contactEmail: contactEmail?.trim() || null,
        isRemote,
      },
    });

    try {
      const url = await createSquarePaymentLink(business.squareAccessToken, {
        amountCents: priceCents,
        name: `${purchase.label} — ${business.name}`,
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
            product_data: { name: `${purchase.label} — ${business.name}` },
            unit_amount: priceCents,
          },
          quantity: 1,
        },
      ],
      metadata: {
        kind: "package",
        userId,
        businessId: business.id,
        packageType: purchase.packageTypeForDb,
        packageOptionId: purchase.packageOptionIdForDb || "",
        durationMinutes: purchase.durationMinutesForDb ? String(purchase.durationMinutesForDb) : "",
        durationLabel: purchase.durationLabelForDb || "",
        lessonsTotal: String(purchase.lessonsTotal),
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
