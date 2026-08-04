import { prisma } from "./prisma";
import { wallClockToUTC } from "./time";

// Builds an array like ["08:00", "09:00", ..., "16:00"] from a business's
// actual configured open/close hours, rather than a fixed range - this is
// what makes the "Business hours" setting genuinely control the calendar,
// instead of being a display-only label that has no real effect.
// closeHour is exclusive, so open=8/close=17 generates 8:00 through 16:00
// (the last full hour before closing), matching how the original fixed
// 8-to-4 range worked.
function buildHourlyTimes(openHour: number, closeHour: number): string[] {
  const times: string[] = [];
  for (let h = openHour; h < closeHour; h++) {
    times.push(`${String(h).padStart(2, "0")}:00`);
  }
  return times;
}

export async function seedInstructorAvailability(businessId: string, instructorMembershipId: string, days = 28) {
  const business = await prisma.business.findUnique({ where: { id: businessId }, select: { openHour: true, closeHour: true } });
  const times = buildHourlyTimes(business?.openHour ?? 8, business?.closeHour ?? 17);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const rows: { startTime: Date }[] = [];

  for (let dayOffset = 0; dayOffset < days; dayOffset++) {
    const date = new Date(today);
    date.setDate(date.getDate() + dayOffset);

    for (const time of times) {
      const [h, m] = time.split(":").map(Number);
      const startTime = wallClockToUTC(date, h, m);
      rows.push({ startTime });
    }
  }

  for (const row of rows) {
    await prisma.availability.upsert({
      where: { businessId_instructorMembershipId_startTime: { businessId, instructorMembershipId, startTime: row.startTime } },
      update: {},
      create: { businessId, instructorMembershipId, startTime: row.startTime, status: "open" },
    });
  }

  return rows.length;
}
