import { Prisma } from "@prisma/client";

// The calendar is built from fixed hourly slots (see lib/seedAvailability.ts),
// but a service can run longer than an hour - a fitting especially: driver
// (45 min), iron (60 min), full bag (90 min). Booking only the one slot the
// player actually clicked left every slot after it still showing "open",
// so a second player could book the following hour while the first
// fitting was still genuinely in progress - a real double-booking risk,
// not just a display glitch.
//
// This closes off whichever hourly slots the booking's real duration
// actually runs into, beyond the one slot already marked booked. It
// encodes the originating booking's id into closedReason (`overlap:<id>`)
// rather than adding a new column, so reopenOverlapBlockedSlots can find
// and undo exactly this booking's blocks later with no schema change.
export async function blockOverlappingSlots(
  tx: Prisma.TransactionClient,
  args: {
    businessId: string;
    instructorMembershipId: string;
    startTime: Date;
    durationMinutes: number;
    primarySlotId: string;
    bookingId: string;
  }
) {
  const { businessId, instructorMembershipId, startTime, durationMinutes, primarySlotId, bookingId } = args;
  // 60 minutes or less fits entirely within the one hourly slot that's
  // already been marked booked - nothing else to close off.
  if (durationMinutes <= 60) return;

  const endTime = new Date(startTime.getTime() + durationMinutes * 60 * 1000);
  const overlapping = await tx.availability.findMany({
    where: {
      businessId,
      instructorMembershipId,
      id: { not: primarySlotId },
      status: "open",
      startTime: { gt: startTime, lt: endTime },
    },
    select: { id: true },
  });
  if (overlapping.length === 0) return;

  await tx.availability.updateMany({
    where: { id: { in: overlapping.map((s) => s.id) } },
    data: { status: "closed", closedReason: `overlap:${bookingId}` },
  });
}

// Cancelling a booking that had blocked follow-on slots (see above) should
// free those back up too, not just the one slot the booking itself sat on
// - otherwise a cancelled 90-minute fitting would permanently take the
// next hour off the board for no reason.
export async function reopenOverlapBlockedSlots(
  tx: Prisma.TransactionClient,
  bookingId: string
) {
  await tx.availability.updateMany({
    where: { closedReason: `overlap:${bookingId}` },
    data: { status: "open", closedReason: null },
  });
}
