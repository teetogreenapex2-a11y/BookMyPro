import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug, ensureMembership, getInstructorById, getBookingNotificationRecipients } from "@/lib/tenant";
import { findPackage, getPackagePriceCents, isPackageEnabled, isPackagePriceSet } from "@/lib/pricing";
import { sendBookingNotification } from "@/lib/email";
import { sendPushToMembership, checkAndNotifyLowPackage } from "@/lib/pushNotifications";
import { businessDestination } from "@/lib/businessUrl";

// POST /api/{slug}/packages/club-billed
//   { packageType, instructorMembershipId, availabilityId?, contactName?, contactPhone?, contactEmail?, isRemote? }
//
// Genuinely different from a deposit - no money moves through the app
// at all here, since a club or the owner bills the player separately,
// entirely outside the app. Both sides need this clearly labeled as
// such wherever it shows up, not mistaken for "pay in person" (which
// still implies the instructor personally collects it).
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  if (!business.allowClubBilling) {
    return NextResponse.json({ error: "This business doesn't offer club/owner billing" }, { status: 400 });
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

  // No slot chosen yet - just create the package.
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
        paymentStatus: "club_billed",
      },
    });
    return NextResponse.json(created, { status: 201 });
  }

  const slot = await prisma.availability.findFirst({
    where: { id: availabilityId, businessId: business.id, instructorMembershipId, status: "open" },
  });
  if (!slot) return NextResponse.json({ error: "That time isn't available anymore" }, { status: 400 });

  // Same reasoning as the deposit and pay-at-lesson flows before it - no
  // payment is secured through the app here at all, so this always
  // needs a real, explicit confirmation from the instructor regardless
  // of the business's general auto-confirm setting.
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
        paymentStatus: "club_billed",
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
      serviceLabel: "Lesson (billed separately)",
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
    body: `${contactName?.trim() || "A player"} - billed separately - ${slot.startTime.toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })}`,
    url: businessDestination(business.slug, "/instructor"),
  });
  await checkAndNotifyLowPackage(result.package.id);

  return NextResponse.json({ ...result.package, booking: result.booking }, { status: 201 });
}
