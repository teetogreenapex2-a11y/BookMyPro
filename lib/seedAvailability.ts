import { prisma } from "./prisma";
import { wallClockToUTC } from "./time";

const TIMES = ["08:00", "09:00", "10:00", "11:00", "13:00", "14:00", "15:00", "16:00"];

export async function seedInstructorAvailability(businessId: string, instructorMembershipId: string, days = 28) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const rows: { startTime: Date }[] = [];

  for (let dayOffset = 0; dayOffset < days; dayOffset++) {
    const date = new Date(today);
    date.setDate(date.getDate() + dayOffset);

    for (const time of TIMES) {
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
