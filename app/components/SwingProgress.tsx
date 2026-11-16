"use client";

export type ProgressItem = { id: string; date: string; title: string | null; tempo: number | null };

// A student's own progress: how their swing tempo has changed across videos,
// plus one-tap comparisons of their earlier and latest swings. Deliberately
// never compares against anyone else's swing.
export default function SwingProgress({ items, onCompare }: { items: ProgressItem[]; onCompare: (leftId: string, rightId: string) => void }) {
  const sorted = [...items].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  if (sorted.length < 2) return null;
  const withTempo = sorted.filter((i) => i.tempo != null);
  const first = sorted[0], latest = sorted[sorted.length - 1], prev = sorted[sorted.length - 2];
  const W = 290, H = 80;
  const x = (i: number) => (i / Math.max(1, withTempo.length - 1)) * W + 5;
  const y = (t: number) => H - ((Math.max(1.5, Math.min(4.5, t)) - 1.5) / 3) * 70;
  const days = (new Date(latest.date).getTime() - new Date(first.date).getTime()) / 86400000;
  const span = days >= 14 ? `${Math.round(days / 7)} weeks` : `${Math.max(1, Math.round(days))} day${Math.round(days) === 1 ? "" : "s"}`;
  const btn: React.CSSProperties = { background: "#FFF", border: "1px solid var(--border)", color: "var(--fairway)", borderRadius: 8, padding: "7px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" };
  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: 14, marginBottom: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>Progress</div>
      <div style={{ fontSize: 12, color: "var(--faint)", marginBottom: 10 }}>{sorted.length} videos over {span}. Compared only with this student's own swings.</div>
      {withTempo.length >= 2 && (
        <>
          <svg viewBox={`0 0 ${W + 10} ${H + 10}`} style={{ width: "100%", maxHeight: 110 }}>
            <polyline fill="none" stroke="#1B3A2F" strokeWidth="2" points={withTempo.map((v, i) => `${x(i)},${y(v.tempo!)}`).join(" ")} />
            {withTempo.map((v, i) => <circle key={v.id} cx={x(i)} cy={y(v.tempo!)} r="3.5" fill="#1B3A2F" />)}
          </svg>
          <div style={{ fontSize: 13, margin: "4px 0 10px" }}>
            Tempo <strong>{withTempo[0].tempo!.toFixed(1)} : 1</strong> → <strong>{withTempo[withTempo.length - 1].tempo!.toFixed(1)} : 1</strong>
          </div>
        </>
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button style={btn} onClick={() => onCompare(first.id, latest.id)}>First vs latest</button>
        {sorted.length > 2 && <button style={btn} onClick={() => onCompare(prev.id, latest.id)}>Previous vs latest</button>}
      </div>
    </div>
  );
}
