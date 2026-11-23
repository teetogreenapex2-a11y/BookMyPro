// Adds the chat + visitor-account database fields and takes Chat out of the menu.
const fs = require("fs");
function edit(file, fn) { const s = fs.readFileSync(file, "utf8"); const r = fn(s); if (r === null || r === s) { console.log("no change needed: " + file); return; } fs.writeFileSync(file, r); console.log("updated: " + file); }
edit("prisma/schema.prisma", (s) => {
  if (!s.includes("model SiteChat ")) s += fs.readFileSync("chat-models.prisma", "utf8");
  if (!s.includes("visitorEmail")) {
    const a = /(model SiteVisit \{[\s\S]*?\n  referrer[^\n]*\n)/;
    if (!a.test(s)) { console.log("ERROR: SiteVisit model not found in schema.prisma"); process.exit(1); }
    s = s.replace(a, `$1  userId       String   @default("")\n  visitorName  String   @default("")\n  visitorEmail String   @default("")\n`);
  }
  return s;
});
edit("lib/navCatalog.ts", (s) => s.replace(/\n\s*I\("chat", "Chat", "messages", "\/chat"\),/, ""));
