import { NextRequest, NextResponse } from "next/server";
import { sendDailyScheduleNotifications } from "@/lib/dailySchedule";

// GET /api/cron/daily-schedule?secret=...  — scheduled to run at 7:00 AM
// Eastern (see vercel.json). Sends every active owner/instructor an email
// and push notification summarizing their own confirmed bookings for
// today. Same auth pattern as /api/cron/calendar-sync.
export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret") || req.headers.get("authorization")?.replace("Bearer ", "");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await sendDailyScheduleNotifications();
  return NextResponse.json(result);
}
