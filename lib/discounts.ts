import { prisma } from "@/lib/prisma";
import { discountedPrice, discountLabel } from "@/lib/discountMath";

export type DiscountService = "lesson" | "fitting";

export function normalizeCode(raw: unknown) {
  return String(raw || "").trim().toUpperCase().replace(/\s+/g, "");
}

// Finds a code a customer can use right now for this kind of purchase with
// this instructor. Returns a plain-English error instead of throwing.
export type DiscountWho = { userId?: string | null; email?: string | null };

// Each code works once per customer. A customer is matched by their account
// or by the email they book with, so a second account doesn't get around it.
async function alreadyUsed(discountCodeId: string, who?: DiscountWho) {
  const or: any[] = [];
  if (who?.userId) or.push({ userId: who.userId });
  const email = String(who?.email || "").trim().toLowerCase();
  if (email) or.push({ email });
  if (!or.length) return false;
  return !!(await prisma.discountRedemption.findFirst({ where: { discountCodeId, OR: or } }));
}

export async function findUsableDiscount(businessId: string, rawCode: unknown, service: DiscountService, instructorMembershipId: string | null, who?: DiscountWho) {
  const code = normalizeCode(rawCode);
  if (!code) return { error: "Enter a discount code" } as const;
  const d = await prisma.discountCode.findFirst({ where: { businessId, code } });
  const bad = { error: "That discount code isn't valid" } as const;
  if (!d || !d.active) return bad;
  if (d.expiresAt && d.expiresAt.getTime() < Date.now()) return { error: "That discount code has expired" } as const;
  if (d.appliesTo === "lessons" && service !== "lesson") return { error: "That code is only for lessons" } as const;
  if (d.appliesTo === "fittings" && service !== "fitting") return { error: "That code is only for club fittings" } as const;
  if (d.instructorMembershipId && d.instructorMembershipId !== instructorMembershipId) return { error: "That code is for a different instructor" } as const;
  if (await alreadyUsed(d.id, who)) return { error: "You've already used that code" } as const;
  return { discount: d } as const;
}

// Called once a payment has actually gone through (never for an abandoned checkout).
export async function recordDiscountUse(businessId: string, rawCode: unknown, userId?: string | null, email?: string | null) {
  const code = normalizeCode(rawCode);
  if (!code || !userId) return;
  const d = await prisma.discountCode.findFirst({ where: { businessId, code } });
  if (!d) return;
  const exists = await prisma.discountRedemption.findFirst({ where: { discountCodeId: d.id, userId } });
  if (exists) return; // webhooks can arrive twice
  await prisma.discountRedemption.create({ data: { discountCodeId: d.id, businessId, userId, email: String(email || "").trim().toLowerCase() || null } });
}

// Used by the checkout routes: validates the code and returns the new price.
export async function applyDiscountCode(businessId: string, rawCode: unknown, service: DiscountService, instructorMembershipId: string | null, priceCents: number, who?: DiscountWho) {
  const found = await findUsableDiscount(businessId, rawCode, service, instructorMembershipId, who);
  if ("error" in found) return { error: found.error } as const;
  const d = found.discount;
  const { finalCents } = discountedPrice(d.kind, d.value, priceCents);
  return { finalCents, code: d.code, label: discountLabel(d.kind, d.value) } as const;
}
