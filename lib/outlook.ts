// Outlook/Microsoft 365 calendar client — mirrors lib/googleCalendar.ts's
// shape so the rest of the app can treat both providers the same way (see
// lib/calendar.ts for the provider-agnostic wrapper used everywhere else).
//
// NOTE: written against Microsoft's documented v2.0 OAuth endpoints and
// Microsoft Graph API as of this writing. Like the Square integration, this
// is newer and less exercised than the Google path — verify against the
// current docs (https://learn.microsoft.com/en-us/graph/api/resources/calendar)
// before trusting it with a real production calendar, particularly the
// event/extended-property field names.

const AUTH_BASE = "https://login.microsoftonline.com/common/oauth2/v2.0";
const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

// "common" allows both personal Microsoft accounts and work/school 365
// accounts to sign in — the typical choice for a multi-tenant SaaS like this
// one, where you don't know in advance what kind of account each instructor uses.
const SCOPES = ["offline_access", "Calendars.ReadWrite", "User.Read"];

const CLIENT_ID = process.env.OUTLOOK_CLIENT_ID;
const CLIENT_SECRET = process.env.OUTLOOK_CLIENT_SECRET;
const REDIRECT_URI = process.env.OUTLOOK_CALENDAR_REDIRECT_URI; // e.g. https://yourapp.com/api/calendar/outlook/callback

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.warn("OUTLOOK_CLIENT_ID / OUTLOOK_CLIENT_SECRET are not set — Outlook calendar calls will fail until they are.");
}

// Step 1: the URL an instructor visits to authorize this app against their
// Outlook/Microsoft 365 calendar. `state` carries the businessId through the
// OAuth round-trip — the callback URL is fixed (registered in the Azure
// portal) and can't be per-business, same pattern as Google's connect flow.
export function getOutlookAuthUrl(state: string) {
  const params = new URLSearchParams({
    client_id: CLIENT_ID || "",
    response_type: "code",
    redirect_uri: REDIRECT_URI || "",
    response_mode: "query",
    scope: SCOPES.join(" "),
    state,
  });
  return `${AUTH_BASE}/authorize?${params.toString()}`;
}

// Step 2: exchange the ?code=... callback param for tokens.
export async function exchangeOutlookCode(code: string) {
  const res = await fetch(`${AUTH_BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID || "",
      client_secret: CLIENT_SECRET || "",
      code,
      redirect_uri: REDIRECT_URI || "",
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`Outlook token exchange failed: ${await res.text()}`);
  const data = await res.json();
  return {
    accessToken: data.access_token as string,
    refreshToken: data.refresh_token as string,
    expiresAt: new Date(Date.now() + (data.expires_in as number) * 1000),
  };
}

// Microsoft Graph access tokens expire quickly (~1hr) — this refreshes and
// returns a new one whenever needed. Unlike Google (where the googleapis
// client does this internally), the caller here is responsible for
// persisting the new access token — see getValidOutlookAccessToken below.
export async function refreshOutlookToken(refreshToken: string) {
  const res = await fetch(`${AUTH_BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID || "",
      client_secret: CLIENT_SECRET || "",
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Outlook token refresh failed: ${await res.text()}`);
  const data = await res.json();
  return {
    accessToken: data.access_token as string,
    refreshToken: (data.refresh_token as string) || refreshToken, // Microsoft doesn't always rotate the refresh token
    expiresAt: new Date(Date.now() + (data.expires_in as number) * 1000),
  };
}

// The marker used to recognize events this app created (Outlook doesn't
// have Google-style extendedProperties on the free tier of Graph the way we
// use them for Google, so a category is the simplest reliable equivalent).
const APP_CATEGORY = "Tee to Green Golf";

export async function createOutlookEvent(
  accessToken: string,
  {
    summary,
    description,
    startTime,
    durationMinutes,
  }: { summary: string; description: string; startTime: Date; durationMinutes: number }
) {
  const endTime = new Date(startTime.getTime() + durationMinutes * 60000);

  const res = await fetch(`${GRAPH_BASE}/me/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({
      subject: summary,
      body: { contentType: "text", content: description },
      start: { dateTime: startTime.toISOString(), timeZone: "UTC" },
      end: { dateTime: endTime.toISOString(), timeZone: "UTC" },
      categories: [APP_CATEGORY],
    }),
  });
  if (!res.ok) throw new Error(`Outlook event creation failed: ${await res.text()}`);
  const data = await res.json();
  return data.id as string;
}

export async function deleteOutlookEvent(accessToken: string, eventId: string) {
  const res = await fetch(`${GRAPH_BASE}/me/events/${eventId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok && res.status !== 404) throw new Error(`Outlook event deletion failed: ${await res.text()}`);
}

// Lists events in a window, for two-way sync (see lib/calendarSync.ts).
export async function listOutlookEvents(accessToken: string, timeMin: Date, timeMax: Date) {
  const params = new URLSearchParams({
    startDateTime: timeMin.toISOString(),
    endDateTime: timeMax.toISOString(),
    $top: "250",
  });
  const res = await fetch(`${GRAPH_BASE}/me/calendarview?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}`, Prefer: 'outlook.timezone="UTC"' },
  });
  if (!res.ok) throw new Error(`Outlook events list failed: ${await res.text()}`);
  const data = await res.json();
  return (data.value || []) as Array<{
    id: string;
    subject?: string;
    bodyPreview?: string;
    start?: { dateTime?: string };
    end?: { dateTime?: string };
    categories?: string[];
  }>;
}

export function isAppOwnedOutlookEvent(event: { categories?: string[] }) {
  return !!event.categories?.includes(APP_CATEGORY);
}
