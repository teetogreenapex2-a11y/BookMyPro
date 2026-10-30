"use client";

export type PathPoint = { x: number; y: number }; // 0-1, relative to the video frame

function mix(a: number, b: number, t: number) { return Math.round(a + (b - a) * t); }
// yellow at address, shading to red at the end of the arc
function colorAt(t: number) {
  return `rgb(${mix(255, 235, t)}, ${mix(214, 60, t)}, ${mix(30, 40, t)})`;
}

// One Catmull-Rom segment between p1 and p2 as a cubic bezier.
function segment(p0: PathPoint, p1: PathPoint, p2: PathPoint, p3: PathPoint) {
  const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
  const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
  return `M ${p1.x} ${p1.y} C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${p2.x} ${p2.y}`;
}

// Draws the full club path as a smooth, glowing arc over whatever it is layered on
// (put it inside the same relative box as the video). In editing mode a tap adds a point.
export default function ClubPathLayer({
  points,
  editing,
  onAdd,
}: {
  points: PathPoint[];
  editing?: boolean;
  onAdd?: (p: PathPoint) => void;
}) {
  const n = points.length;
  const segs: { d: string; color: string }[] = [];
  for (let i = 0; i < n - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p3 = points[Math.min(n - 1, i + 2)];
    segs.push({ d: segment(p0, points[i], points[i + 1], p3), color: colorAt(n > 2 ? i / (n - 2) : 0) });
  }
  return (
    <div
      onClick={(e) => {
        if (!editing || !onAdd) return;
        const r = e.currentTarget.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width;
        const y = (e.clientY - r.top) / r.height;
        if (x < 0 || x > 1 || y < 0 || y > 1) return;
        onAdd({ x, y });
      }}
      style={{
        position: "absolute", top: 0, left: 0, width: "100%", height: "100%",
        pointerEvents: editing ? "auto" : "none", cursor: editing ? "crosshair" : "default",
      }}
    >
      {n > 1 && (
        <svg
          viewBox="0 0 1 1"
          preserveAspectRatio="none"
          style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", overflow: "visible", filter: "drop-shadow(0 0 3px rgba(255,200,0,0.9))", pointerEvents: "none" }}
        >
          {segs.map((s, i) => (
            <path key={i} d={s.d} fill="none" stroke={s.color} strokeWidth={3.5} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          ))}
        </svg>
      )}
      {editing && points.map((p, i) => (
        <div
          key={i}
          style={{
            position: "absolute", left: `${p.x * 100}%`, top: `${p.y * 100}%`, width: 12, height: 12, marginLeft: -6, marginTop: -6,
            borderRadius: "50%", background: i === 0 ? "#3DDC84" : "#FFD21F", border: "2px solid #1B3A2F", pointerEvents: "none",
          }}
        />
      ))}
    </div>
  );
}
