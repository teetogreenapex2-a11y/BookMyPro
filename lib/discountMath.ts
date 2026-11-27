// Pure math for discount codes. No database in here, so the booking page can
// use the same function as the server to show the customer their new price.
export type DiscountKind = "percent" | "amount";

// Customers always pay at least 50 cents (the card minimum) on anything that
// costs at least that much. Use "Add manually" for a fully free lesson.
export const MIN_CHARGE_CENTS = 50;

export function discountedPrice(kind: string, value: number, priceCents: number) {
  if (priceCents <= 0) return { finalCents: 0, discountCents: 0 };
  let off = kind === "percent" ? Math.round((priceCents * value) / 100) : value;
  off = Math.max(0, Math.min(off, priceCents));
  let final = priceCents - off;
  if (priceCents >= MIN_CHARGE_CENTS && final < MIN_CHARGE_CENTS) final = MIN_CHARGE_CENTS;
  return { finalCents: final, discountCents: priceCents - final };
}

export function discountLabel(kind: string, value: number) {
  return kind === "percent" ? `${value}% off` : `$${(value / 100).toFixed(value % 100 === 0 ? 0 : 2)} off`;
}
