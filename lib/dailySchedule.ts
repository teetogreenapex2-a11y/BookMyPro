import { prisma } from "./prisma";
import { wallClockToUTC } from "./time";
import { businessDestination } from "./businessUrl";
import { sendDailyScheduleEmail } from "./email";
import { sendPushToMembership } from "./pushNotifications";

const TARGET_LOCAL_HOUR = 7; // 7:00 AM in each business's own timezone

// Sends every active owner/instructor a summary of their own confirmed
// bookings for today, by email and push - each at 7:00 AM in their own
// business's timezone, not a single fixed UTC moment. Meant to be called
// once an hour by a scheduled job (see
// app/api/cron/daily-schedule/route.ts), which is what lets this reach
// every timezone's own 7 AM without a separate cron entry per zone; each
// run only actually sends to businesses whose local time is in the target
// hour right now.
export async function sendDailyScheduleNotifications() {
  const now = new Date();

  const instructors = await prisma.membership.findMany({
    where: { role: { in: ["owner", "instructor"] }, status: "active" },
    include: { user: true, business: true },
  });

  let sent = 0;
  let skipped = 0;
  let notLocal7am = 0;

  for (const instructor of instructors) {
    const timezone = instructor.business.timezone;
    const currentLocalHour = Number(
      new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "2-digit", hour12: false }).format(now)
    );
    // % 24 folds the "24" some engines return for midnight back to 0 -
    // irrelevant for matching hour 7 specifically, but keeps this correct
    // if TARGET_LOCAL_HOUR is ever changed to midnight.
    if (currentLocalHour % 24 !== TARGET_LOCAL_HOUR) {
      notLocal7am++;
      continue;
    }

    const startOfDay = wallClockToUTC(now, 0, 0, timezone);
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    // Midnight tomorrow, not startOfDay + 24h - a fixed 24h offset would
    // be wrong by an hour on a daylight saving transition day.
    const endOfDay = wallClockToUTC(tomorrow, 0, 0, timezone);

    const bookings = await prisma.booking.findMany({
      where: {
        instructorMembershipId: instructor.id,
        status: "confirmed",
        startTime: { gte: startOfDay, lt: endOfDay },
      },
      orderBy: { startTime: "asc" },
    });

    // Nothing on the books today - skip rather than send an empty
    // notification every single morning regardless. Easy to flip if a
    // "your day is clear" version turns out to be wanted instead.
    if (bookings.length === 0) {
      skipped++;
      continue;
    }

    const scheduleUrl = businessDestination(instructor.business.slug, "/instructor");

    const items = bookings.map((b) => ({
      time: b.startTime.toLocaleString("en-US", {
        hour: "numeric", minute: "2-digit", timeZone: timezone,
      }),
      label: b.serviceType === "fitting" ? `${b.fittingType || "Club"} fitting` : (b.isRemote ? "Remote lesson" : "Lesson"),
      contactName: b.contactName,
    }));

    if (instructor.user.email) {
      await sendDailyScheduleEmail(instructor.user.email, {
        businessName: instructor.business.name,
        instructorName: instructor.user.name,
        items,
        scheduleUrl,
      });
    }

    const firstTime = items[0].time;
    await sendPushToMembership(instructor.id, {
      title: `Today's schedule: ${bookings.length} ${bookings.length === 1 ? "lesson" : "lessons"}`,
      body: `First one at ${firstTime}${items[0].contactName ? ` with ${items[0].contactName}` : ""}`,
      url: scheduleUrl,
    });

    sent++;
  }

  return { instructorsChecked: instructors.length, notificationsSent: sent, skippedNoBookings: skipped, notLocal7am };
}
