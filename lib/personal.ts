import { prisma } from "./prisma";

export const PERSONAL_VIDEO_CAP = 100;
export const PERSONAL_TRIAL_DAYS = 7;

export function personalCanUpload(status: string | null | undefined, comped = false) {
  return comped || status === "active" || status === "trialing";
}

// Personal is free for a pro's real students: an active player at an
// approved studio who either booked or bought a package there, or was added
// by hand by the pro. Merely sending a video (or a CSV import) doesn't count.
export async function isPersonalComped(userId: string) {
  const m = await prisma.membership.findFirst({
    where: {
      userId, role: "player", status: "active", isSandboxProspect: false,
      business: { approved: true },
      OR: [
        { source: "manual" },
        { business: { packages: { some: { userId } } } },
        { business: { bookings: { some: { userId } } } },
      ],
    },
    select: { id: true },
  });
  return !!m;
}

// True if this player still has lesson credits with this instructor - the
// review is then included and free.
export async function hasLessonsLeft(userId: string, businessId: string, instructorMembershipId: string) {
  const pkg = await prisma.package.findFirst({
    where: { userId, businessId, instructorMembershipId, lessonsRemaining: { gt: 0 } },
    select: { id: true },
  });
  return !!pkg;
}

export async function getPersonalState(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { personalStatus: true, personalStripeCustomerId: true },
  });
  const count = await prisma.personalVideo.count({ where: { userId } });
  const comped = await isPersonalComped(userId);
  return {
    comped,
    status: user?.personalStatus || "none",
    hasCustomer: !!user?.personalStripeCustomerId,
    count,
    cap: PERSONAL_VIDEO_CAP,
  };
}
