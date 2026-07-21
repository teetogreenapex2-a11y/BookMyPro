import { prisma } from "@/lib/prisma";

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O or 1/I — easy to misread when typing a gift card code in

function randomSegment(length: number) {
  let s = "";
  for (let i = 0; i < length; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return s;
}

export async function generateGiftCardCode(): Promise<string> {
  // Collision odds are astronomically low, but check anyway rather than assume.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = `TTG-${randomSegment(4)}-${randomSegment(4)}`;
    const existing = await prisma.giftCard.findUnique({ where: { code } });
    if (!existing) return code;
  }
  throw new Error("Could not generate a unique gift card code");
}

// Looks up a gift card by code, scoped to the business, and confirms it
// actually has value left. Returns null rather than throwing so callers can
// show a plain "that code isn't valid" message instead of a stack trace.
export async function findRedeemableGiftCard(businessId: string, code: string) {
  const giftCard = await prisma.giftCard.findFirst({
    where: { businessId, code: code.trim().toUpperCase(), status: "active" },
  });
  if (!giftCard || giftCard.remainingValueCents <= 0) return null;
  return giftCard;
}

// Applies up to `requestedCents` from a gift card toward a booking or order,
// returning how much was actually applied (capped at the card's remaining
// balance) so the caller knows how much is still owed by another payment
// method. Depletes the card and logs the redemption in the same transaction
// so a partial failure can't leave the balance and the redemption record
// out of sync with each other.
export async function redeemGiftCard(
  giftCardId: string,
  requestedCents: number,
  target: { bookingId?: string; orderId?: string }
): Promise<number> {
  return prisma.$transaction(async (tx) => {
    const card = await tx.giftCard.findUnique({ where: { id: giftCardId } });
    if (!card || card.status !== "active" || card.remainingValueCents <= 0) return 0;

    const amountToApply = Math.min(requestedCents, card.remainingValueCents);
    const remaining = card.remainingValueCents - amountToApply;

    await tx.giftCard.update({
      where: { id: giftCardId },
      data: { remainingValueCents: remaining, status: remaining <= 0 ? "depleted" : "active" },
    });
    await tx.giftCardRedemption.create({
      data: { giftCardId, amountCents: amountToApply, bookingId: target.bookingId, orderId: target.orderId },
    });

    return amountToApply;
  });
}
