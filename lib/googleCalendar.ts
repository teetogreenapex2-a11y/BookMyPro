import { google } from "googleapis";

const CALENDAR_SCOPES = ["https://www.googleapis.com/auth/calendar.events"];

function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_CALENDAR_REDIRECT_URI // e.g. https://yourapp.com/api/calendar/callback
  );
}

// Step 1: build the consent URL the instructor visits to grant calendar access.
// `state` carries the businessId through Google's OAuth round-trip — the
// callback URL is fixed (registered in Google Cloud Console) and can't be
// per-business, so this is how the callback knows which business/membership
// to attach the resulting refresh token to.
export function getCalendarAuthUrl(state: string) {
  const client = getOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline", // required to get a refresh_token
    prompt: "consent", // forces refresh_token on repeat connects
    scope: CALENDAR_SCOPES,
    state,
  });
}

// Step 2: exchange the ?code=... callback param for tokens.
export async function getRefreshTokenFromCode(code: string) {
  const client = getOAuthClient();
  const { tokens } = await client.getToken(code);
  return tokens.refresh_token; // store this on the instructor's User record
}

function getAuthorizedClient(refreshToken: string) {
  const client = getOAuthClient();
  client.setCredentials({ refresh_token: refreshToken });
  return client;
}

export async function createCalendarEvent(
  refreshToken: string,
  {
    summary,
    description,
    startTime,
    durationMinutes,
  }: { summary: string; description: string; startTime: Date; durationMinutes: number }
) {
  const auth = getAuthorizedClient(refreshToken);
  const calendar = google.calendar({ version: "v3", auth });

  const endTime = new Date(startTime.getTime() + durationMinutes * 60000);

  const res = await calendar.events.insert({
    calendarId: "primary",
    requestBody: {
      summary,
      description,
      start: { dateTime: startTime.toISOString() },
      end: { dateTime: endTime.toISOString() },
      // Marks this event as app-created so calendar sync doesn't treat it as an
      // external block (it's already reflected as a "booked" Availability slot).
      extendedProperties: { private: { source: "tee-to-green" } },
    },
  });

  return res.data.id; // save this as googleCalendarEventId
}

export async function deleteCalendarEvent(refreshToken: string, eventId: string) {
  const auth = getAuthorizedClient(refreshToken);
  const calendar = google.calendar({ version: "v3", auth });
  await calendar.events.delete({ calendarId: "primary", eventId });
}

// Lists all events on the instructor's calendar within a window, for two-way sync.
export async function listCalendarEvents(refreshToken: string, timeMin: Date, timeMax: Date) {
  const auth = getAuthorizedClient(refreshToken);
  const calendar = google.calendar({ version: "v3", auth });

  const res = await calendar.events.list({
    calendarId: "primary",
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 250,
  });

  return res.data.items || [];
}

// Google events created by this app are tagged via extendedProperties (see
// createCalendarEvent above) — everything else is "external" for two-way
// sync purposes. Exported so lib/calendar.ts can use it without duplicating
// the check.
export function isGoogleAppOwnedEvent(event: { extendedProperties?: { private?: Record<string, string> | null } | null }) {
  return event.extendedProperties?.private?.source === "tee-to-green";
}
