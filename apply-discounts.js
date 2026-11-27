// Adds discount codes (percent or dollar off lessons and fittings). Safe to run twice.
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
  if (!s.includes(find)) { console.log("  !! pattern not found:", find.slice(0, 60).replace(/\n/g, "\\n")); return s; }
  return all ? s.split(find).join(repl) : s.replace(find, () => repl);
}

edit("prisma/schema.prisma", (s) => {
  if (s.includes("model DiscountCode")) return s;
  s = must(s, "model Business {\n  id     String @id @default(cuid())\n", "model Business {\n  id     String @id @default(cuid())\n  discountCodes DiscountCode[]\n");
  return s.replace(/\s*$/, "\n") + `
// A code a customer types at booking for a percent or dollar amount off lessons or fittings.
model DiscountCode {
  id                     String    @id @default(cuid())
  business               Business  @relation(fields: [businessId], references: [id])
  businessId             String
  code                   String    // stored uppercase
  kind                   String    // "percent" | "amount"
  value                  Int       // percent (1-99) or cents
  appliesTo              String    @default("all") // "all" | "lessons" | "fittings"
  instructorMembershipId String?   // null = works with every instructor
  expiresAt              DateTime?
  active                 Boolean   @default(true)
  createdAt              DateTime  @default(now())

  @@unique([businessId, code])
  @@index([businessId])
}
`;
});

edit("lib/deleteBusiness.ts", (s) => {
  if (s.includes("discountCode")) return s;
  return must(s, "    await tx.giftCard.deleteMany({ where: { businessId } });\n", "    await tx.giftCard.deleteMany({ where: { businessId } });\n    await tx.discountCode.deleteMany({ where: { businessId } });\n");
});

edit("lib/navCatalog.ts", (s) => {
  if (s.includes('"discounts"')) return s;
  s = must(s, '  I("giftcards", "Gift cards", "gift", "/gift-cards"),\n  I("settings", "Settings", "settings", "/settings"),\n];\n\nconst OWNER_ALL',
    '  I("giftcards", "Gift cards", "gift", "/gift-cards"),\n  I("discounts", "Discounts", "gift", "/discounts"),\n  I("settings", "Settings", "settings", "/settings"),\n];\n\nconst OWNER_ALL');
  s = must(s, "...STAFF_ALL.slice(0, 8),", "...STAFF_ALL.slice(0, 9),");
  s = must(s, "  STAFF_ALL[8],\n];", "  STAFF_ALL[9],\n];");
  return s;
});

edit("lib/changelog.ts", (s) => {
  if (s.includes("2026-11-26-discounts")) return s;
  return must(s, "export const CHANGELOG: ChangeEntry[] = [\n", `export const CHANGELOG: ChangeEntry[] = [
  {
    id: "2026-11-26-discounts",
    date: "Nov 26, 2026",
    title: "Discount codes for lessons and fittings",
    text: "Offer a percent or dollar amount off. Open Discounts in More, make a code, and share it. Customers enter it when they book and see their new price before they pay. You can limit a code to lessons or fittings, one instructor, or an end date, and turn it off any time.",
    audience: "staff",
  },
`);
});

function checkoutPatch(s, svc, nameVar, kindLine) {
  if (s.includes("applyDiscountCode")) return s;
  s = must(s, 'import { getBusinessAbsoluteUrl } from "@/lib/businessUrl";\n', 'import { getBusinessAbsoluteUrl } from "@/lib/businessUrl";\nimport { applyDiscountCode } from "@/lib/discounts";\n');
  return s;
}

edit("app/api/[slug]/packages/checkout/route.ts", (s) => {
  if (s.includes("applyDiscountCode")) return s;
  s = checkoutPatch(s);
  s = must(s, "isRemote: submittedIsRemote } = await req.json();", "isRemote: submittedIsRemote, discountCode } = await req.json();");
  s = must(s, "  const priceCents = purchase.priceCents;\n", `  let priceCents = purchase.priceCents;
  let discountNote = "";
  let appliedCode = "";
  if (discountCode && String(discountCode).trim()) {
    const d = await applyDiscountCode(business.id, discountCode, "lesson", instructorMembershipId, priceCents);
    if ("error" in d) return NextResponse.json({ error: d.error }, { status: 400 });
    priceCents = d.finalCents; appliedCode = d.code; discountNote = \` (\${d.label} with \${d.code})\`;
  }
`);
  s = must(s, "${purchase.label} — ${business.name}", "${purchase.label} — ${business.name}${discountNote}", true);
  s = must(s, '        kind: "package",\n        userId,', '        kind: "package",\n        discountCode: appliedCode,\n        userId,');
  return s;
});

edit("app/api/[slug]/fittings/checkout/route.ts", (s) => {
  if (s.includes("applyDiscountCode")) return s;
  s = checkoutPatch(s);
  s = must(s, "contactEmail, paymentMethod } = await req.json();", "contactEmail, paymentMethod, discountCode } = await req.json();");
  s = must(s, "  const priceCents = getFittingPriceCents(instructorMembership, fitting.id);\n", `  let priceCents = getFittingPriceCents(instructorMembership, fitting.id);
  let discountNote = "";
  let appliedCode = "";
  if (discountCode && String(discountCode).trim()) {
    const d = await applyDiscountCode(business.id, discountCode, "fitting", instructorMembershipId, priceCents);
    if ("error" in d) return NextResponse.json({ error: d.error }, { status: 400 });
    priceCents = d.finalCents; appliedCode = d.code; discountNote = \` (\${d.label} with \${d.code})\`;
  }
`);
  s = must(s, "${fitting.label} — ${business.name}", "${fitting.label} — ${business.name}${discountNote}", true);
  s = must(s, '        kind: "fitting",\n        userId,', '        kind: "fitting",\n        discountCode: appliedCode,\n        userId,');
  return s;
});

edit("app/[slug]/book/BookingClient.tsx", (s) => {
  if (s.includes("PromoCodeField")) return s;
  s = must(s, "\nimport ", '\nimport PromoCodeField from "@/app/components/PromoCodeField";\nimport ');
  s = must(s, "  const [contact, setContact] = useState({", '  const [promoCode, setPromoCode] = useState("");\n  const [contact, setContact] = useState({');
  s = must(s, "        paymentMethod: payMethod,\n        ...(pendingCustomOfferingSlot", "        paymentMethod: payMethod,\n        discountCode: promoCode.trim() || undefined,\n        ...(pendingCustomOfferingSlot");
  s = must(s, "        paymentMethod: payMethod,\n        availabilityId: selected.id,\n        fittingType,", "        paymentMethod: payMethod,\n        discountCode: promoCode.trim() || undefined,\n        availabilityId: selected.id,\n        fittingType,");
  s = must(s, "            )}\n\n            <button\n              onClick={() => {\n                const issue = bookingIssue();\n                if (issue) { setMessage(issue); return; }\n                (service === \"lesson\"",
`            )}

            {(service === "fitting" || (service === "lesson" && isBuyingPackage)) && (
              <PromoCodeField
                apiBase={apiBase}
                service={service === "fitting" ? "fitting" : "lesson"}
                instructorMembershipId={selectedInstructorId}
                priceCents={service === "fitting" ? (activeFitting?.priceCents ?? 0) : (pendingPurchaseInfo?.priceCents ?? 0)}
                value={promoCode}
                onChange={setPromoCode}
              />
            )}

            <button
              onClick={() => {
                const issue = bookingIssue();
                if (issue) { setMessage(issue); return; }
                (service === "lesson"`);
  return s;
});
