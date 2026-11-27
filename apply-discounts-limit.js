// Adds "one use per customer" to discount codes. Run after apply-discounts.js. Safe to run twice.
const fs = require("fs");
function edit(file, fn) {
  if (!fs.existsSync(file)) { console.log("MISSING (skipped):", file); return; }
  const raw = fs.readFileSync(file, "utf8");
  const crlf = raw.includes("\r\n");
  const s = raw.replace(/\r\n/g, "\n");
  const out = fn(s);
  if (out === s) { console.log("unchanged (already applied or pattern not found):", file); return; }
  fs.writeFileSync(file, crlf ? out.replace(/\n/g, "\r\n") : out); console.log("patched:", file);
}
function must(s, find, repl, all) {
  if (!s.includes(find)) { console.log("  !! pattern not found:", find.slice(0, 70).replace(/\n/g, "\\n")); return s; }
  return all ? s.split(find).join(repl) : s.replace(find, () => repl);
}

edit("prisma/schema.prisma", (s) => {
  if (s.includes("model DiscountRedemption")) return s;
  s = must(s, "model PendingSquarePayment {\n  id            String   @id @default(cuid())\n", "model PendingSquarePayment {\n  id            String   @id @default(cuid())\n  discountCode  String?\n");
  return s.replace(/\s*$/, "\n") + `
// One row each time a customer actually pays using a discount code.
model DiscountRedemption {
  id             String   @id @default(cuid())
  discountCodeId String
  businessId     String
  userId         String
  email          String?
  createdAt      DateTime @default(now())

  @@index([discountCodeId])
  @@index([businessId])
}
`;
});

edit("lib/deleteBusiness.ts", (s) => {
  if (s.includes("discountRedemption")) return s;
  return must(s, "    await tx.discountCode.deleteMany({ where: { businessId } });\n", "    await tx.discountRedemption.deleteMany({ where: { businessId } });\n    await tx.discountCode.deleteMany({ where: { businessId } });\n");
});

edit("lib/stripeEvents.ts", (s) => {
  if (s.includes("recordDiscountUse")) return s;
  s = must(s, 'import { fulfillPledgeSession } from "@/lib/rafflePledge";\n', 'import { fulfillPledgeSession } from "@/lib/rafflePledge";\nimport { recordDiscountUse } from "@/lib/discounts";\n');
  s = must(s, "    // Payment alert for the business + receipt for the customer, sent as soon as",
    "    // A discount code only counts as used once the money is in.\n    if (meta.discountCode) await recordDiscountUse(businessId, meta.discountCode, meta.userId, meta.contactEmail).catch((e) => console.error(\"Discount record failed:\", e));\n\n    // Payment alert for the business + receipt for the customer, sent as soon as");
  return s;
});

edit("app/api/square/webhook/route.ts", (s) => {
  if (s.includes("recordDiscountUse")) return s;
  s = must(s, "import { prisma }", 'import { recordDiscountUse } from "@/lib/discounts";\nimport { prisma }');
  s = must(s, "  const businessId = pending.businessId;\n", "  const businessId = pending.businessId;\n  if (pending.discountCode) await recordDiscountUse(businessId, pending.discountCode, pending.userId, pending.contactEmail).catch((e) => console.error(\"Discount record failed:\", e));\n");
  return s;
});

for (const [file, svc] of [["app/api/[slug]/packages/checkout/route.ts", "lesson"], ["app/api/[slug]/fittings/checkout/route.ts", "fitting"]]) {
  edit(file, (s) => {
    if (s.includes("discountCode: appliedCode || null")) return s;
    s = must(s, `applyDiscountCode(business.id, discountCode, "${svc}", instructorMembershipId, priceCents)`,
      `applyDiscountCode(business.id, discountCode, "${svc}", instructorMembershipId, priceCents, { userId: (session.user as any).id, email: contactEmail || session.user?.email })`);
    s = must(s, "const pending = await prisma.pendingSquarePayment.create({\n      data: {\n        businessId: business.id,", "const pending = await prisma.pendingSquarePayment.create({\n      data: {\n        discountCode: appliedCode || null,\n        businessId: business.id,");
    return s;
  });
}
