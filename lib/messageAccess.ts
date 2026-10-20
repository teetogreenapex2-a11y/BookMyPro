import { prisma } from "@/lib/prisma";

// Who on staff can see which customer's messages.
//
// - Owners see every customer's conversation at their business.
// - Instructors see only the customers who are theirs: someone who has
//   booked a lesson with them, or holds a package for them.
//
// Returns the set of customer user ids an instructor may see, or null for
// an owner (meaning no restriction).
export async function visiblePlayerUserIds(
  businessId: string,
  staff: { id: string; role: string }
): Promise<Set<string> | null> {
  if (staff.role === "owner") return null;

  const [bookings, packages] = await Promise.all([
    prisma.booking.findMany({
      where: { businessId, instructorMembershipId: staff.id },
      select: { playerId: true },
      distinct: ["playerId"],
    }),
    prisma.package.findMany({
      where: { businessId, instructorMembershipId: staff.id },
      select: { userId: true },
      distinct: ["userId"],
    }),
  ]);

  const ids = new Set<string>();
  for (const b of bookings) ids.add(b.playerId);
  for (const p of packages) ids.add(p.userId);
  return ids;
}

export async function staffCanSeePlayer(
  businessId: string,
  staff: { id: string; role: string },
  playerUserId: string
): Promise<boolean> {
  const ids = await visiblePlayerUserIds(businessId, staff);
  return ids === null || ids.has(playerUserId);
}
