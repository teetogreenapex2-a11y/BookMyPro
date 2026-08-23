import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { google } from "googleapis";
import { prisma } from "@/lib/prisma";
import { isPlatformAdmin } from "@/lib/tenant";

// GET /api/admin/test-google-token?membershipId=...
//
// Actually attempts to use the stored googleRefreshToken to fetch a fresh
// access token from Google, and reports the real, raw result - success or
// the exact error Google gives - rather than inferring anything from
// downstream symptoms. Temporary; safe to delete once this is resolved.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const isAdmin = await isPlatformAdmin((session.user as any).id);
  if (!isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const membershipId = req.nextUrl.searchParams.get("membershipId");
  if (!membershipId) return NextResponse.json({ error: "Pass ?membershipId=..." }, { status: 400 });

  const membership = await prisma.membership.findUnique({
    where: { id: membershipId },
    include: { user: true },
  });
  if (!membership) return NextResponse.json({ error: "Membership not found" }, { status: 404 });
  if (!membership.googleRefreshToken) {
    return NextResponse.json({ error: "No googleRefreshToken stored on this membership" }, { status: 400 });
  }
  // First 8 / last 4 characters only - enough to tell whether the stored
  // value actually changes between reconnect attempts, without exposing
  // the real, working token.
  const tokenFingerprint = `${membership.googleRefreshToken.slice(0, 8)}...${membership.googleRefreshToken.slice(-4)} (${membership.googleRefreshToken.length} chars)`;

  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_CALENDAR_REDIRECT_URI
  );
  client.setCredentials({ refresh_token: membership.googleRefreshToken });

  try {
    const { credentials } = await client.refreshAccessToken();
    // Also try an actual, real Calendar API call - a token can refresh
    // successfully but still lack the calendar.events scope if something
    // upstream went wrong, so this checks both layers separately.
    let calendarListOk = false;
    let calendarError: string | null = null;
    try {
      const calendar = google.calendar({ version: "v3", auth: client });
      await calendar.calendarList.list({ maxResults: 1 });
      calendarListOk = true;
    } catch (calErr: any) {
      calendarError = calErr?.message || String(calErr);
    }

    return NextResponse.json({
      membershipId: membership.id,
      user: { name: membership.user.name, email: membership.user.email },
      tokenFingerprint,
      tokenRefreshSucceeded: true,
      hasAccessToken: !!credentials.access_token,
      expiresAt: credentials.expiry_date ? new Date(credentials.expiry_date).toISOString() : null,
      calendarApiCallSucceeded: calendarListOk,
      calendarApiError: calendarError,
    });
  } catch (err: any) {
    return NextResponse.json({
      membershipId: membership.id,
      user: { name: membership.user.name, email: membership.user.email },
      tokenFingerprint,
      tokenRefreshSucceeded: false,
      // The real, raw error from Google - this is the actual "why"
      // instead of the generic invalid_grant label the app shows.
      error: err?.message || String(err),
      errorResponseData: err?.response?.data || null,
    }, { status: 500 });
  }
}
