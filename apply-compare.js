// Hooks the new compare features into the player and instructor video pages. Safe to run twice.
const fs = require("fs");
function edit(file, fn) {
  const raw = fs.readFileSync(file, "utf8");
  const crlf = raw.includes("\r\n");
  const s = raw.replace(/\r\n/g, "\n");
  const out = fn(s);
  if (out === s) { console.log("unchanged (already applied or pattern not found):", file); return; }
  fs.writeFileSync(file, crlf ? out.replace(/\n/g, "\r\n") : out); console.log("patched:", file);
}
const CLIP_RE = /clips=\{(submissions(?:\.filter\(\(x\) => x\.playerId === selected\.playerId\))?)\.map\(\(x\) => \(\{ id: x\.id, url: x\.videoUrl, label: `\$\{x\.title \|\| "Swing"\} · \$\{new Date\(x\.submittedAt\)\.toLocaleDateString\(\)\}` \}\)\)\}/;
edit("app/[slug]/videos/VideosClient.tsx", (s) => {
  if (s.includes("submissionToClip")) return s;
  s = s.replace('import VideoCompare from "@/app/components/VideoCompare";', 'import VideoCompare, { submissionToClip } from "@/app/components/VideoCompare";');
  return s.replace(CLIP_RE, "clips={$1.map(submissionToClip)}");
});
edit("app/[slug]/instructor/videos/InstructorVideosClient.tsx", (s) => {
  if (s.includes("submissionToClip")) return s;
  s = s.replace('import VideoCompare from "@/app/components/VideoCompare";', 'import VideoCompare, { submissionToClip } from "@/app/components/VideoCompare";');
  s = s.replace(CLIP_RE, "clips={$1.map(submissionToClip)}");
  return s.replace(
    "                    onClose={() => setCmp(null)}\n",
    "                    onClose={() => setCmp(null)}\n                    sketchApiBase={apiBase}\n                    onAddNote={async (clipId, t, text) => {\n                      const r = await fetch(`${apiBase}/videos/${clipId}/comments`, { method: \"POST\", headers: { \"Content-Type\": \"application/json\" }, body: JSON.stringify({ timestampSeconds: t, text }) });\n                      if (!r.ok) throw new Error(\"failed\");\n                      load();\n                    }}\n"
  );
});
edit("lib/changelog.ts", (s) => {
  if (s.includes("2026-11-23-compare-pro")) return s;
  return s.replace("export const CHANGELOG: ChangeEntry[] = [\n", `export const CHANGELOG: ChangeEntry[] = [
  {
    id: "2026-11-23-compare-pro",
    date: "Nov 23, 2026",
    title: "Smarter swing compare",
    text: "Compare now lets you tap Mark impact on each swing so both play in sync at impact, step both videos one frame at a time, switch to an Overlay that ghosts one swing over the other, and draw lines, angles and circles right on the video. You can filter by club, see notes pinned to a moment, and save the comparison as one video with the voice-over. Instructors can also save a frame to Swing Sketch. Progress now has a monthly recap and one-tap Then vs now buttons.",
    audience: "all",
  },
`);
});
