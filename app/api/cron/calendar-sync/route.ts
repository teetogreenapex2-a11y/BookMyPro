import { NextRequest, NextResponse } from "next/server";
import { syncAllBusinesses } from "@/lib/calendarSync";

// GET /api/cron/calendar-sync?secret=...  — for a scheduled job (e.g. Vercel Cron)
// to call periodically. Syncs every business with a connected Google Calendar.
// Set CRON_SECRET in your environment and configure your cron job to hit this
// URL with the same secret as a query param or Bearer token.
export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret") || req.headers.get("authorization")?.replace("Bearer ", "");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = await syncAllBusinesses();
  return NextResponse.json({ businessesSynced: results.length, results });
}
