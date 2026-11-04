import { prisma } from "./prisma";
import { ensureMembership } from "./tenant";
import { sendPushToMembership } from "./pushNotifications";
import { businessDestination } from "./businessUrl";

// Finds an instructor a Personal user is allowed to send a video to.
export async function findSendableInstructor(instructorMembershipId: string) {
  return prisma.membership.findFirst({
    where: {
      id: instructorMembershipId, role: { in: ["owner", "instructor"] }, status: "active",
      hiddenFromBooking: false, isSandboxProspect: false,
      business: { approved: true, videoEnabled: true, listedInDirectory: true },
    },
    include: { business: true, user: { select: { name: true } } },
  });
}

// Creates the instructor-side submission (idempotent) and notifies them.
// Called directly for free reviews, or from the Stripe webhook once a paid
// review has been paid for.
export async function createReviewSubmission(userId: string, videoId: string, instructorMembershipId: string) {
  const video = await prisma.personalVideo.findFirst({ where: { id: videoId, userId } });
  if (!video) return null;
  const instructor = await findSendableInstructor(instructorMembershipId);
  if (!instructor) return null;

  const dup = await prisma.videoSubmission.findFirst({
    where: { playerId: userId, instructorMembershipId, videoUrl: video.videoUrl },
  });
  if (dup) return instructor;

  await ensureMembership(userId, instructor.businessId, "player");
  await prisma.videoSubmission.create({
    data: {
      businessId: instructor.businessId,
      playerId: userId,
      instructorMembershipId,
      videoUrl: video.videoUrl,
      title: video.title,
      playerNote: video.note || null,
    },
  });
  await sendPushToMembership(instructorMembershipId, {
    title: "New swing video submitted",
    body: video.title ? `"${video.title}" is ready to review.` : "A new video is ready to review.",
    url: businessDestination(instructor.business.slug, "/instructor/videos"),
  }).catch(() => {});
  return instructor;
}

// What this player owes for a review: nothing if they still have lessons
// with this instructor, otherwise the instructor's own review price.
export async function reviewPriceFor(userId: string, instructor: { id: string; businessId: string; videoReviewPriceCents: number | null }) {
  const price = instructor.videoReviewPriceCents || 0;
  if (price <= 0) return 0;
  const { hasLessonsLeft } = await import("./personal");
  return (await hasLessonsLeft(userId, instructor.businessId, instructor.id)) ? 0 : price;
}
