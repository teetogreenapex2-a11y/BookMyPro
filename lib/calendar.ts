// Every place in the app that needs to touch a calendar (create/delete/list
// events) goes through here instead of lib/googleCalendar.ts or lib/outlook.ts
// directly — this is what makes the rest of the codebase not need to care
// which provider a given business connected.
import { prisma } from "./prisma";
import { createCalendarEvent, deleteCalendarEvent, listCalendarEvents, isGoogleAppOwnedEvent } from "./googleCalendar";
import { createOutlookEvent, deleteOutlookEvent, listOutlookEvents, refreshOutlookToken, isAppOwnedOutlookEvent } from "./outlook";

type Membership = {
  id: string;
  googleRefreshToken?: string | null;
  outlookAccessToken?: string | null;
  outlookRefreshToken?: string | null;
  outlookTokenExpiresAt?: Date | null;
};

type Business = { calendarProvider: string };

export function hasCalendarConnected(business: Business, membership: Membership | null | undefined) {
  if (!membership) return false;
  return business.calendarProvider === "outlook" ? !!membership.outlookRefreshToken : !!membership.googleRefreshToken;
}

// Outlook access tokens expire in ~1hr and must be refreshed explicitly
// (unlike Google, where the googleapis client does this internally from
// just the refresh token) — this returns a valid access token, refreshing
// and persisting a new one first if the stored one has expired or is close to it.
async function getValidOutlookAccessToken(membership: Membership): Promise<string | null> {
  if (!membership.outlookRefreshToken) return null;

  const expiresAt = membership.outlookTokenExpiresAt;
  const expiringSoon = !expiresAt || expiresAt.getTime() < Date.now() + 2 * 60 * 1000; // refresh if <2min left

  if (!expiringSoon && membership.outlookAccessToken) return membership.outlookAccessToken;

  const tokens = await refreshOutlookToken(membership.outlookRefreshToken);
  await prisma.membership.update({
    where: { id: membership.id },
    data: {
      outlookAccessToken: tokens.accessToken,
      outlookRefreshToken: tokens.refreshToken,
      outlookTokenExpiresAt: tokens.expiresAt,
    },
  });
  return tokens.accessToken;
}

export async function createEvent(
  business: Business,
  membership: Membership,
  details: { summary: string; description: string; startTime: Date; durationMinutes: number }
): Promise<string | null> {
  if (business.calendarProvider === "outlook") {
    const accessToken = await getValidOutlookAccessToken(membership);
    if (!accessToken) return null;
    return createOutlookEvent(accessToken, details);
  }
  if (!membership.googleRefreshToken) return null;
  return (await createCalendarEvent(membership.googleRefreshToken, details)) || null;
}

export async function deleteEvent(business: Business, membership: Membership, eventId: string): Promise<void> {
  if (business.calendarProvider === "outlook") {
    const accessToken = await getValidOutlookAccessToken(membership);
    if (!accessToken) return;
    await deleteOutlookEvent(accessToken, eventId);
    return;
  }
  if (!membership.googleRefreshToken) return;
  await deleteCalendarEvent(membership.googleRefreshToken, eventId);
}

// Normalized shape both providers get mapped into, so lib/calendarSync.ts
// doesn't need its own provider branching.
export type NormalizedEvent = {
  id: string;
  title: string;
  startTime: Date | null;
  endTime: Date | null;
  isAppOwned: boolean;
};

export async function listEvents(business: Business, membership: Membership, timeMin: Date, timeMax: Date): Promise<NormalizedEvent[]> {
  if (business.calendarProvider === "outlook") {
    const accessToken = await getValidOutlookAccessToken(membership);
    if (!accessToken) return [];
    const events = await listOutlookEvents(accessToken, timeMin, timeMax);
    return events.map((e) => ({
      id: e.id,
      title: e.subject || "",
      startTime: e.start?.dateTime ? new Date(e.start.dateTime + "Z") : null,
      endTime: e.end?.dateTime ? new Date(e.end.dateTime + "Z") : null,
      isAppOwned: isAppOwnedOutlookEvent(e),
    }));
  }

  if (!membership.googleRefreshToken) return [];
  const events = await listCalendarEvents(membership.googleRefreshToken, timeMin, timeMax);
  return events.map((e: any) => ({
    id: e.id,
    title: e.summary || "",
    startTime: e.start?.dateTime ? new Date(e.start.dateTime) : null,
    endTime: e.end?.dateTime ? new Date(e.end.dateTime) : null,
    isAppOwned: isGoogleAppOwnedEvent(e),
  }));
}
