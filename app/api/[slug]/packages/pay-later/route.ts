import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug, ensureMembership, getInstructorById, getBookingNotificationRecipients } from "@/lib/tenant";
import { findPackage, getPackagePriceCents, isPackageEnabled, isPackagePriceSet } from "@/lib/pricing";
import { sendBookingNotification } from "@/lib/email";
import { sendPushToMembership, checkAndNotifyLowPackage } from "@/lib/pushNotifications";
import { businessDestination } from "@/lib/businessUrl";

// POST /api/{slug}/packages/pay-later
//   { packageType, instructorMembershipId, availabilityId?, contactName?, contactPhone?, contactEmail?, isRemote? }
//
// Creates a Package with paymentStatus "pending" - no Stripe/Square
// checkout involved, since the business collects payment in person and
// marks it paid later (see PATCH /api/{slug}/packages/[id]).
//
// If availabilityId is included, this also books that specific slot with
// the package's first credit, in the same request - this is what makes
// "pay at first lesson" a genuine, complete alternative to the real
// checkout button at the actual confirm step, rather than a separate
// action that only reserves credits without an actual lesson time.
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  if (!business.allowPayLater) {
    return NextResponse.json({ error: "This business doesn't offer pay-at-first-lesson" }, { status: 400 });
  }

  const { packageType, instructorMembershipId, availabilityId, contactName, contactPhone, contactEmail, isRemote: submittedIsRemote } = await req.json();
  const pkgDef = findPackage(packageType);
  if (!pkgDef) return NextResponse.json({ error: "Unknown package type" }, { status: 400 });
  if (pkgDef.id === "video" && !business.dailyApiKey) {
    return NextResponse.json({ error: "This business hasn't set up remote lessons yet" }, { status: 400 });
  }

  if (!instructorMembershipId) {
    return NextResponse.json({ error: "Choose which instructor you're booking with" }, { status: 400 });
  }
  const instructorMembership = await getInstructorById(business.id, instructorMembershipId);
  if (!instructorMembership) {
    return NextResponse.json({ error: "That instructor isn't available at this business" }, { status: 400 });
  }

  if (!isPackageEnabled(instructorMembership, pkgDef.id)) {
    return NextResponse.json({ error: "This package isn't currently offered by this instructor" }, { status: 400 });
  }
  if (!isPackagePriceSet(instructorMembership, pkgDef.id)) {
    return NextResponse.json({ error: "This package doesn't have a price set yet - contact the business" }, { status: 400 });
  }

  const userId = (session.user as any).id;
  await ensureMembership(userId, business.id, "player");

  const isRemote = pkgDef.id === "video" || !!submittedIsRemote;

  // No slot chosen yet - just create the package, same as the original behavior.
  if (!availabilityId) {
    const created = await prisma.package.create({
      data: {
        businessId: business.id,
        userId,
        instructorMembershipId,
        type: pkgDef.id,
        lessonsTotal: pkgDef.lessons,
        lessonsRemaining: pkgDef.lessons,
        pricePaidCents: getPackagePriceCents(instructorMembership, pkgDef.id),
        paymentStatus: "pending",
      },
    });
    return NextResponse.json(created, { status: 201 });
  }

  // A slot was chosen - create the package and book it together, so this
  // is a genuine, complete alternative to paying online at the confirm
  // step, not a separate "buy credits only" action.
  const slot = await prisma.availability.findFirst({
    where: { id: availabilityId, businessId: business.id, instructorMembershipId, status: "open" },
  });
  if (!slot) return NextResponse.json({ error: "That time isn't available anymore" }, { status: 400 });

  // Pay-at-lesson always needs a real confirmation from the instructor,
  // regardless of the business's general requireBookingApproval setting -
  // no payment is secured upfront here, so this specific path shouldn't
  // ever be allowed to auto-confirm the way a paid booking safely can.
  const needsApproval = true;

  const result = await prisma.$transaction(async (tx) => {
    const created = await tx.package.create({
      data: {
        businessId: business.id,
        userId,
        instructorMembershipId,
        type: pkgDef.id,
        lessonsTotal: pkgDef.lessons,
        lessonsRemaining: pkgDef.lessons - 1,
        pricePaidCents: getPackagePriceCents(instructorMembership, pkgDef.id),
        paymentStatus: "pending",
      },
    });

    await tx.availability.update({ where: { id: slot.id }, data: { status: needsApproval ? "pending" : "booked" } });

    const newBooking = await tx.booking.create({
      data: {
        businessId: business.id,
        playerId: userId,
        instructorMembershipId,
        serviceType: "lesson",
        startTime: slot.startTime,
        priceCents: 0,
        packageId: created.id,
        availabilityId: slot.id,
        isRemote,
        status: needsApproval ? "pending" : "confirmed",
        contactName: contactName?.trim() || null,
        contactPhone: contactPhone?.trim() || null,
        contactEmail: contactEmail?.trim() || null,
      },
    });

    return { package: created, booking: newBooking };
  });

  if (business.notifyOnBooking) {
    await sendBookingNotification(await getBookingNotificationRecipients(business, instructorMembershipId), {
      businessName: business.name,
      serviceLabel: "Lesson",
      startTime: slot.startTime,
      contactName: contactName?.trim() || null,
      contactPhone: contactPhone?.trim() || null,
      contactEmail: contactEmail?.trim() || null,
      priceCents: 0,
      isPending: needsApproval,
      reviewUrl: needsApproval ? businessDestination(business.slug, "/instructor") : undefined,
    });
  }
  await sendPushToMembership(instructorMembershipId, {
    title: "New booking request",
    body: `${contactName?.trim() || "A player"} - pay at lesson - ${slot.startTime.toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })}`,
    url: businessDestination(business.slug, "/instructor"),
  });
  await checkAndNotifyLowPackage(result.package.id);

  return NextResponse.json({ ...result.package, booking: result.booking }, { status: 201 });
}
