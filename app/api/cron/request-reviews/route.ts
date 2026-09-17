import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendReviewRequestEmail } from "@/lib/email";
import { sendPushToMembership } from "@/lib/pushNotifications";
import { businessDestination } from "@/lib/businessUrl";

// GET /api/cron/request-reviews?secret=...  - runs hourly via Vercel Cron.
//
// A lesson counts as "done" once its start time is a few hours in the
// past - there's no stored end time on a Booking, and a few hours past
// start reliably covers any real lesson length without needing to join
// into package/duration data just to guess an exact end. reviewRequestedAt
// (set at the bottom of this loop) is what actually prevents asking
// twice - it's checked instead of "does a Review exist yet" so someone
// who never leaves one still only gets asked once, not every hour.
const HOURS_AFTER_START = 3;

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret") || req.headers.get("authorization")?.replace("Bearer ", "");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - HOURS_AFTER_START * 60 * 60 * 1000);

  const dueBookings = await prisma.booking.findMany({
    where: {
      status: "confirmed",
      serviceType: "lesson",
      startTime: { lt: cutoff },
      reviewRequestedAt: null,
      instructorMembershipId: { not: null },
    },
    include: {
      player: { select: { id: true, name: true, email: true } },
      instructor: { select: { user: { select: { name: true } } } },
      business: { select: { id: true, slug: true, name: true } },
    },
    take: 200, // safety cap per run - a normal hourly batch is nowhere near this
  });

  let requested = 0;
  for (const booking of dueBookings) {
    const reviewUrl = businessDestination(booking.business.slug, `/review/${booking.id}`);
    const instructorName = booking.instructor?.user.name || "your instructor";

    if (booking.player.email) {
      await sendReviewRequestEmail(booking.player.email, {
        businessName: booking.business.name,
        instructorName,
        reviewUrl,
      });
    }

    const playerMembership = await prisma.membership.findUnique({
      where: { userId_businessId: { userId: booking.playerId, businessId: booking.businessId } },
    });
    if (playerMembership) {
      await sendPushToMembership(playerMembership.id, {
        title: "How was your lesson?",
        body: `Rate your lesson with ${instructorName}`,
        url: reviewUrl,
      });
    }

    await prisma.booking.update({ where: { id: booking.id }, data: { reviewRequestedAt: new Date() } });
    requested++;
  }

  return NextResponse.json({ requested });
}
