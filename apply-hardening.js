// Security fixes found in the project audit. Safe to run twice.
const fs = require("fs");
function edit(file, fn) {
  if (!fs.existsSync(file)) { console.log("skipped (not found):", file); return; }
  const raw = fs.readFileSync(file, "utf8");
  const crlf = raw.includes("\r\n");
  const s = raw.replace(/\r\n/g, "\n");
  const out = fn(s);
  if (out === s) { console.log("unchanged (already applied or pattern not found):", file); return; }
  fs.writeFileSync(file, crlf ? out.replace(/\n/g, "\r\n") : out); console.log("patched:", file);
}
// 1. A bio, name or business name containing "</script>" could break out of the structured-data tag.
for (const f of ["app/[slug]/instructors/page.tsx", "app/[slug]/instructors/[id]/page.tsx"]) {
  edit(f, (s) => s
    .replace("JSON.stringify(entry) }}", 'JSON.stringify(entry).replace(/</g, "\\\\u003c") }}')
    .replace("JSON.stringify(jsonLd) }}", 'JSON.stringify(jsonLd).replace(/</g, "\\\\u003c") }}'));
}
// 2. Swing-session join codes: members only, limited guesses.
edit("app/api/[slug]/swing-sessions/join/route.ts", (s) => {
  if (s.includes("tooMany")) return s;
  s = s.replace('import { authOptions } from "@/lib/auth";', 'import { authOptions } from "@/lib/auth";\nimport { tooMany } from "@/lib/rateLimit";\nimport { getMembership } from "@/lib/tenant";');
  return s.replace(
    "  const { joinCode } = await req.json();",
    '  const memberOf = await getMembership((session.user as any).id, business.id);\n  if (!memberOf || memberOf.status !== "active") return NextResponse.json({ error: "Not a member of this business" }, { status: 403 });\n  if (tooMany(`join:${(session.user as any).id}`, 8, 10 * 60 * 1000)) return NextResponse.json({ error: "Too many tries - wait a few minutes and try again" }, { status: 429 });\n\n  const { joinCode } = await req.json();'
  );
});
edit("app/api/[slug]/swing-sessions/route.ts", (s) => {
  if (s.includes("randomInt")) return s;
  s = s.replace('import { prisma } from "@/lib/prisma";', 'import { prisma } from "@/lib/prisma";\nimport { randomInt } from "crypto";');
  return s.replace("String(Math.floor(100000 + Math.random() * 900000))", "String(randomInt(100000, 1000000))");
});
// 3. Gift card codes: unpredictable generation, limited guessing on the check endpoint.
edit("lib/giftCards.ts", (s) => {
  if (s.includes("randomInt")) return s;
  s = s.replace('import { prisma } from "@/lib/prisma";', 'import { prisma } from "@/lib/prisma";\nimport { randomInt } from "crypto";');
  return s.replace("CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]", "CODE_CHARS[randomInt(CODE_CHARS.length)]");
});
edit("app/api/[slug]/gift-cards/validate/route.ts", (s) => {
  if (s.includes("tooMany")) return s;
  s = s.replace('import { findRedeemableGiftCard } from "@/lib/giftCards";', 'import { findRedeemableGiftCard } from "@/lib/giftCards";\nimport { tooMany, clientIp } from "@/lib/rateLimit";');
  return s.replace(
    "  const { code } = await req.json();",
    '  if (tooMany(`gcv:${clientIp(req)}`, 12, 10 * 60 * 1000)) return NextResponse.json({ error: "Too many tries - wait a few minutes and try again" }, { status: 429 });\n\n  const { code } = await req.json();'
  );
});
