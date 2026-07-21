import { prisma } from "./prisma";
import { listEvents, hasCalendarConnected, type NormalizedEvent } from "./calendar";
import { findFitting, getFittingPriceCents } from "./pricing";
import { getBusinessInstructor } from "./tenant";

const SLOT_BLOCK_MINUTES = 60; // matches the hourly grid used throughout the app
const SYNC_WINDOW_DAYS = 28;

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return aStart < bEnd && bStart < aEnd;
}

// Instructor can create an event titled like:  "Book: player@email.com"
// (optionally "Book: player@email.com - Iron fitting") to create a real
// booking directly from their calendar instead of the app — works the same
// way regardless of whether they're on Google or Outlook.
function parseBookingTag(title: string): { email: string; fittingType?: string } | null {
  const match = title.trim().match(/^book:\s*([^\s-]+@[^\s-]+)\s*(?:-\s*(.+))?$/i);
  if (!match) return null;
  const email = match[1].toLowerCase();
  const rest = (match[2] || "").toLowerCase();
  let fittingType: string | undefined;
  if (rest.includes("driver")) fittingType = "driver";
  else if (rest.includes("iron")) fittingType = "iron";
  else if (rest.includes("full")) fittingType = "full";
  return { email, fittingType };
}

// Syncs a single business's calendar. Call this per-business — see
// syncAllBusinesses() below for the scheduled-job entry point that loops
// over every business with a connected calendar (Google or Outlook).
//
// Calendar sync is deliberately one shared connection for the whole
// business (not per-instructor), even though availability itself is now
// per-instructor — getBusinessInstructor() finds whichever staff member
// actually connected a calendar, and external events on THAT PERSON's
// calendar block THAT PERSON's own availability specifically (not every
// instructor's). Bookings created from "Book: email" tags are also
// assigned to that same instructor for the same reason.
export async function syncBusinessCalendar(businessId: string, triggeredBy: "manual" | "cron" = "manual") {
  const business = await prisma.business.findUnique({ where: { id: businessId } });
  const instructorMembership = await getBusinessInstructor(businessId);

  if (!business || !hasCalendarConnected(business, instructorMembership)) {
    await prisma.syncLog.create({
      data: { businessId, success: false, message: "No instructor calendar connected", triggeredBy },
    });
    return { synced: false, reason: "No instructor calendar connected" };
  }

  try {
    const now = new Date();
    const windowEnd = new Date(now.getTime() + SYNC_WINDOW_DAYS * 24 * 60 * 60 * 1000);

    const events: NormalizedEvent[] = await listEvents(business, instructorMembership!, now, windowEnd);
    const externalEvents = events.filter((e) => !e.isAppOwned && e.startTime && e.endTime);

    const slots = await prisma.availability.findMany({
      where: { businessId, instructorMembershipId: instructorMembership!.id, startTime: { gte: now, lte: windowEnd } },
    });

    let created = 0;
    let blocked = 0;
    let unblocked = 0;

    // --- Pass 1: create bookings from "Book: email@x.com" tagged events ---
    for (const event of externalEvents) {
      const tag = parseBookingTag(event.title);
      if (!tag || !event.startTime) continue;

      const startTime = event.startTime;
      const slot = slots.find(
        (s) => s.startTime.getTime() === startTime.getTime() && s.status !== "booked"
      );
      if (!slot) continue;

      const player = await prisma.user.findUnique({ where: { email: tag.email } });
      if (!player) continue; // no matching account — leave it to fall through to blocking pass

      // The tag itself says what kind of booking this is ("- Iron fitting"
      // etc.) — a slot no longer belongs to one service in advance, so this
      // is the only signal available, same as when a player books via the app.
      if (!tag.fittingType) {
        // Packages are instructor-specific now — only a credit bought
        // from *this* instructor can be redeemed on their calendar.
        const pkg = await prisma.package.findFirst({
          where: { userId: player.id, businessId, instructorMembershipId: instructorMembership!.id, lessonsRemaining: { gt: 0 } },
          orderBy: { createdAt: "asc" },
        });
        if (!pkg) continue; // no credits available — don't silently consume a slot for nothing

        await prisma.$transaction(async (tx) => {
          await tx.availability.update({ where: { id: slot.id }, data: { status: "booked", closedReason: null, blockedEventId: null } });
          await tx.package.update({ where: { id: pkg.id }, data: { lessonsRemaining: { decrement: 1 } } });
          await tx.booking.create({
            data: {
              businessId,
              playerId: player.id,
              instructorMembershipId: instructorMembership!.id,
              serviceType: "lesson",
              startTime: slot.startTime,
              priceCents: 0,
              packageId: pkg.id,
              availabilityId: slot.id,
              googleCalendarEventId: event.id || null,
            },
          });
        });
        created++;
      } else {
        const fitting = findFitting(tag.fittingType)!;
        await prisma.$transaction(async (tx) => {
          await tx.availability.update({ where: { id: slot.id }, data: { status: "booked", closedReason: null, blockedEventId: null } });
          await tx.booking.create({
            data: {
              businessId,
              playerId: player.id,
              instructorMembershipId: instructorMembership!.id,
              serviceType: "fitting",
              fittingType: fitting.id,
              startTime: slot.startTime,
              priceCents: getFittingPriceCents(instructorMembership!, fitting.id),
              availabilityId: slot.id,
              googleCalendarEventId: event.id || null,
            },
          });
        });
        created++;
      }
      slot.status = "booked"; // reflect locally so pass 2 doesn't re-process it
    }

    // --- Pass 2: block/unblock slots based on remaining external events ---
    for (const slot of slots) {
      if (slot.status === "booked") continue;

      const slotStart = slot.startTime.getTime();
      const slotEnd = slotStart + SLOT_BLOCK_MINUTES * 60000;

      const conflicting = externalEvents.find((e) => {
        if (!e.startTime || !e.endTime) return false;
        return overlaps(slotStart, slotEnd, e.startTime.getTime(), e.endTime.getTime());
      });

      if (conflicting && slot.closedReason !== "manual") {
        if (slot.status !== "closed" || slot.blockedEventId !== conflicting.id) {
          await prisma.availability.update({
            where: { id: slot.id },
            data: { status: "closed", closedReason: "calendar", blockedEventId: conflicting.id || null },
          });
          blocked++;
        }
      } else if (!conflicting && slot.closedReason === "calendar") {
        await prisma.availability.update({
          where: { id: slot.id },
          data: { status: "open", closedReason: null, blockedEventId: null },
        });
        unblocked++;
      }
    }

    await prisma.syncLog.create({
      data: { businessId, success: true, bookingsCreated: created, slotsBlocked: blocked, slotsUnblocked: unblocked, triggeredBy },
    });

    return { synced: true, bookingsCreated: created, slotsBlocked: blocked, slotsUnblocked: unblocked };
  } catch (err: any) {
    await prisma.syncLog.create({
      data: { businessId, success: false, message: err?.message || "Unknown sync error", triggeredBy },
    });
    return { synced: false, reason: err?.message || "Unknown sync error" };
  }
}

// Scheduled-job entry point — loops over every business that has a
// connected calendar (Google or Outlook) and syncs each one.
export async function syncAllBusinesses() {
  const connected = await prisma.membership.findMany({
    where: {
      role: { in: ["owner", "instructor"] },
      OR: [{ googleRefreshToken: { not: null } }, { outlookRefreshToken: { not: null } }],
    },
    select: { businessId: true },
    distinct: ["businessId"],
  });

  const results = [];
  for (const { businessId } of connected) {
    results.push({ businessId, ...(await syncBusinessCalendar(businessId, "cron")) });
  }
  return results;
}
