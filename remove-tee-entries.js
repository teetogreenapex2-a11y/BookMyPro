// Removes the Tee to Green-specific notes from "What's new" so other
// businesses never see them. Safe to run more than once.
const fs = require("fs");
const f = "lib/changelog.ts";
let s = fs.readFileSync(f, "utf8");
const ids = ["2026-11-16-visitors", "2026-11-17-chat", "2026-11-18-raffle-inperson", "2026-11-10-raffle-200", "2026-11-05-raffle"];
let removed = 0;
for (const id of ids) {
  const re = new RegExp(`  \\{\\n    id: "${id}",\\n[\\s\\S]*?\\n  \\},\\n`);
  if (re.test(s)) { s = s.replace(re, ""); removed++; }
}
fs.writeFileSync(f, s);
console.log(`Removed ${removed} entr${removed === 1 ? "y" : "ies"}.`);
