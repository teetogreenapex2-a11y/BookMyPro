import type { PoseAngle } from "@/lib/poseDetection";

// Shared by every place that shows AI-detected angles: Swing Sketch,
// Instant Replay, past video review, and live calls. `dark` switches
// between the light card style (Swing Sketch, past video review) and the
// dark style used against a black video background (Instant Replay, live
// calls) - same badges, just matched to whatever it's sitting on.
export default function PoseAngleBadges({ angles, dark }: { angles: PoseAngle[]; dark?: boolean }) {
  if (angles.length === 0) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
      {angles.map((a) => (
        <div
          key={a.label}
          style={{
            display: "flex", flexDirection: "column", alignItems: "center", minWidth: 64,
            background: dark ? "rgba(255,255,255,0.1)" : "var(--card)",
            border: dark ? "1px solid rgba(255,255,255,0.25)" : "1px solid var(--border)",
            borderRadius: 8, padding: "5px 8px", opacity: a.uncertain ? 0.55 : 1,
          }}
        >
          <span style={{ fontSize: 15, fontWeight: 800, color: dark ? "#FFF" : "var(--fairway)", lineHeight: 1.3 }}>
            {a.uncertain ? "~" : ""}{a.degrees}&deg;
          </span>
          <span style={{ fontSize: 8.5, fontWeight: 600, color: dark ? "#D7DED9" : "var(--faint)", textTransform: "uppercase", letterSpacing: "0.03em", textAlign: "center" }}>
            {a.label}
          </span>
        </div>
      ))}
    </div>
  );
}
