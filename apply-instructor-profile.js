// Links bios to the new full profile page and lets /book?instructor=ID preselect that instructor. Safe to run twice.
const fs = require("fs");
function edit(file, fn) {
  const raw = fs.readFileSync(file, "utf8");
  const crlf = raw.includes("\r\n");
  const s = raw.replace(/\r\n/g, "\n");
  const out = fn(s);
  if (out === s) { console.log("unchanged (already applied or pattern not found):", file); return; }
  fs.writeFileSync(file, crlf ? out.replace(/\n/g, "\r\n") : out); console.log("patched:", file);
}
edit("app/[slug]/book/BookingClient.tsx", (s) => {
  if (s.includes("bmpWantedInstructor")) return s;
  s = s.replace(
    "          const defaultId = (existingInstructorId && list.some((i) => i.id === existingInstructorId)) ? existingInstructorId : owner?.id;",
    "          const bmpWantedInstructor = typeof window !== \"undefined\" ? new URLSearchParams(window.location.search).get(\"instructor\") : null;\n          const defaultId = (bmpWantedInstructor && list.some((i) => i.id === bmpWantedInstructor)) ? bmpWantedInstructor : (existingInstructorId && list.some((i) => i.id === existingInstructorId)) ? existingInstructorId : owner?.id;"
  );
  return s.replace(
    /(\s*)<p style=\{\{ fontSize: 13, lineHeight: 1\.6, color: "var\(--fairway\)", margin: 0, whiteSpace: "pre-wrap" \}\}>\n\s*\{selectedInstructor\.bio\}\n\s*<\/p>/,
    (m, ws) => `${ws}<div>${m}${ws}  <a href={\`\${basePath}/instructors/\${selectedInstructor.id}\`} style={{ display: "inline-block", marginTop: 8, fontSize: 12.5, color: "var(--gold)", fontWeight: 600, textDecoration: "none" }}>View full profile &rarr;</a>${ws}</div>`
  );
});
edit("app/[slug]/instructors/page.tsx", (s) => {
  if (s.includes("View full profile")) return s;
  return s.replace(
    /(\{m\.bio\}\n\s*<\/p>\n\s*\)\})/,
    (m) => `${m}\n                <a href={\`/\${params.slug}/instructors/\${m.id}\`} style={{ display: "inline-block", marginTop: 12, fontSize: 13, color: "#B8862B", fontWeight: 700, textDecoration: "none" }}>View full profile &rarr;</a>`
  );
});
edit("lib/changelog.ts", (s) => {
  if (s.includes("2026-11-23-instructor-profile")) return s;
  return s.replace("export const CHANGELOG: ChangeEntry[] = [\n", `export const CHANGELOG: ChangeEntry[] = [
  {
    id: "2026-11-23-instructor-profile",
    date: "Nov 23, 2026",
    title: "Full instructor profile pages",
    text: "Tap View full profile under an instructor's bio to see a bigger photo, their full bio, their rating and what students say, with a button to book with them. Instructors can edit their bio and photo in Settings.",
    audience: "all",
  },
`);
});
