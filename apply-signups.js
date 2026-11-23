// Hooks new-signup alerts into web sign-in, Google/Apple native sign-in, and new-business creation. Safe to run twice.
const fs = require("fs");
function edit(file, fn) {
  const raw = fs.readFileSync(file, "utf8");
  const crlf = raw.includes("\r\n");
  const s = raw.replace(/\r\n/g, "\n");
  const out = fn(s);
  if (out === s) { console.log("unchanged (already applied?):", file); return; }
  fs.writeFileSync(file, crlf ? out.replace(/\n/g, "\r\n") : out); console.log("patched:", file);
}
edit("lib/auth.ts", (s) => {
  if (s.includes("alertNewSignup(user")) return s;
  s = s.replace('import { generateAppleClientSecret } from "./appleAuth";', 'import { generateAppleClientSecret } from "./appleAuth";\nimport { alertNewSignup } from "./adminAlert";');
  return s.replace(/  pages: \{\s*signIn: "\/login",\s*\},\n\};/, (m) => m.replace(/\};$/, `  events: {\n    async createUser({ user }) {\n      await alertNewSignup(user, "Google, Apple or email link");\n    },\n  },\n};`));
});
edit("app/api/auth/google-native/route.ts", (s) => {
  if (s.includes("alertNewSignup(user")) return s;
  s = s.replace('import { prisma } from "@/lib/prisma";', 'import { prisma } from "@/lib/prisma";\nimport { alertNewSignup } from "@/lib/adminAlert";');
  return s.replace(/(user = await prisma\.user\.create\(\{\s*data: \{ email, name: payload\.name \|\| null, image: payload\.picture \|\| null \},\s*\}\);)/, "$1\n      await alertNewSignup(user, \"Google (app)\");");
});
edit("app/api/auth/apple-native/route.ts", (s) => {
  if (s.includes("alertNewSignup(user")) return s;
  s = s.replace('import { prisma } from "@/lib/prisma";', 'import { prisma } from "@/lib/prisma";\nimport { alertNewSignup } from "@/lib/adminAlert";');
  return s.replace(/(user = await prisma\.user\.create\(\{\s*data: \{ email, name: name \|\| null \},\s*\}\);)/, "$1\n    await alertNewSignup(user, \"Apple (app)\");");
});
edit("app/api/businesses/route.ts", (s) => {
  if (s.includes("alertPlatformAdmin")) return s;
  s = s.replace('import { sendNewBusinessNotification } from "@/lib/email";', 'import { sendNewBusinessNotification } from "@/lib/email";\nimport { alertPlatformAdmin } from "@/lib/adminAlert";');
  return s.replace(/(  return NextResponse\.json\(\{\s*slug: business\.slug,)/, `  await alertPlatformAdmin({ title: "New business signed up", body: \`\${business.name} (\${session.user?.email || "unknown"}) is waiting for approval\`, url: "/admin/pending-businesses" });\n\n$1`);
});
