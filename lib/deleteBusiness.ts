import { prisma } from "./prisma";

// Permanently, completely removes a business and everything tied to it -
// every booking, package, message, video, gift card, product, and so on.
// Genuinely irreversible. Deletion has to happen in a specific order,
// innermost things first, since a booking can't be deleted while a note
// still points at it, a conversation can't go while a message inside it
// still exists, and so on all the way up to the business itself last.
// Wrapped in one transaction so a failure partway through can't ever
// leave things half-deleted.
export async function deleteBusinessCompletely(businessId: string) {
  await prisma.$transaction(async (tx) => {
    const membershipIds = (await tx.membership.findMany({ where: { businessId }, select: { id: true } })).map((m) => m.id);
    const bookingIds = (await tx.booking.findMany({ where: { businessId }, select: { id: true } })).map((b) => b.id);
    const conversationIds = (await tx.conversation.findMany({ where: { businessId }, select: { id: true } })).map((c) => c.id);
    const videoSubmissionIds = (await tx.videoSubmission.findMany({ where: { businessId }, select: { id: true } })).map((v) => v.id);
    const orderIds = (await tx.order.findMany({ where: { businessId }, select: { id: true } })).map((o) => o.id);
    const productIds = (await tx.product.findMany({ where: { businessId }, select: { id: true } })).map((p) => p.id);
    const giftCardIds = (await tx.giftCard.findMany({ where: { businessId }, select: { id: true } })).map((g) => g.id);

    if (membershipIds.length) {
      await tx.fcmToken.deleteMany({ where: { membershipId: { in: membershipIds } } });
      await tx.pushSubscription.deleteMany({ where: { membershipId: { in: membershipIds } } });
    }
    if (conversationIds.length) {
      await tx.message.deleteMany({ where: { conversationId: { in: conversationIds } } });
    }
    if (bookingIds.length) {
      await tx.note.deleteMany({ where: { bookingId: { in: bookingIds } } });
    }
    if (giftCardIds.length) {
      await tx.giftCardRedemption.deleteMany({ where: { giftCardId: { in: giftCardIds } } });
    }
    if (bookingIds.length) {
      await tx.giftCardRedemption.deleteMany({ where: { bookingId: { in: bookingIds } } });
    }
    if (orderIds.length) {
      await tx.giftCardRedemption.deleteMany({ where: { orderId: { in: orderIds } } });
    }
    if (videoSubmissionIds.length) {
      await tx.videoComment.deleteMany({ where: { submissionId: { in: videoSubmissionIds } } });
    }
    if (orderIds.length) {
      await tx.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
    }

    // Now the business-scoped things themselves, in dependency order.
    await tx.conversation.deleteMany({ where: { businessId } });
    await tx.booking.deleteMany({ where: { businessId } });
    await tx.package.deleteMany({ where: { businessId } });
    await tx.availability.deleteMany({ where: { businessId } });
    await tx.videoSubmission.deleteMany({ where: { businessId } });
    await tx.swingSketch.deleteMany({ where: { businessId } });
    await tx.order.deleteMany({ where: { businessId } });
    if (productIds.length) {
      await tx.productVariant.deleteMany({ where: { productId: { in: productIds } } });
    }
    await tx.product.deleteMany({ where: { businessId } });
    await tx.giftCard.deleteMany({ where: { businessId } });
    await tx.pendingSquarePayment.deleteMany({ where: { businessId } });
    await tx.syncLog.deleteMany({ where: { businessId } });
    await tx.membership.deleteMany({ where: { businessId } });

    // The business itself, genuinely last.
    await tx.business.delete({ where: { id: businessId } });
  });
}
