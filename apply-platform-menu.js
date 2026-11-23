// Adds a "Platform admin" item to the More menu for the platform owner only. Safe to run twice.
const fs = require("fs");
function edit(file, fn) {
  const raw = fs.readFileSync(file, "utf8");
  const crlf = raw.includes("\r\n");
  const s = raw.replace(/\r\n/g, "\n");
  const out = fn(s);
  if (out === s) { console.log("unchanged (already applied?):", file); return; }
  fs.writeFileSync(file, crlf ? out.replace(/\n/g, "\r\n") : out); console.log("patched:", file);
}
edit("lib/navCatalog.ts", (s) => {
  if (s.includes("platformAdmin")) return s;
  s = s.replace("realRole?: string):", "realRole?: string, platformAdmin = false):");
  return s.replace('  all = [...all, I("whatsnew"', '  if (platformAdmin && role !== "player") all = [...all, I("platform", "Platform admin", "settings", "/platform-admin")];\n  all = [...all, I("whatsnew"');
});
edit("app/api/[slug]/my-role/route.ts", (s) => {
  if (s.includes("platformAdmin")) return s;
  s = s.replace('import { getBusinessBySlug, getMembership } from "@/lib/tenant";', 'import { getBusinessBySlug, getMembership, isPlatformAdmin } from "@/lib/tenant";');
  return s.replace("    videoEnabled: business.videoEnabled !== false,\n", "    videoEnabled: business.videoEnabled !== false,\n    platformAdmin: await isPlatformAdmin(userId),\n");
});
for (const f of ["app/providers.tsx", "app/components/NativeMoreSheet.tsx", "app/components/WebTabBar.tsx"]) {
  edit(f, (s) => {
    if (s.includes("platformAdmin")) return s;
    return s.replace("role, videoEnabled, realRole }", "role, videoEnabled, realRole, platformAdmin }").replace("navFor(role, videoEnabled !== false, realRole)", "navFor(role, videoEnabled !== false, realRole, platformAdmin === true)");
  });
}
