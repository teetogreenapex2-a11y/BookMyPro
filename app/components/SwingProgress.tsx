"use client";

export type ProgressItem = { id: string; date: string; title: string | null; tempo: number | null };

const MONTH_MS = 30.4 * 86400000;
const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

// A student's own progress: how their swing tempo has changed across videos,
// a monthly recap, and one-tap "then vs now" comparisons of their earlier and
// latest swings. Deliberately never compares against anyone else's swing.
export default function SwingProgress({ items, onCompare }: { items: ProgressItem[]; onCompare: (leftId: string, rightId: string) => void }) {
  const sorted = [...items].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  if (sorted.length < 2) return null;
  const withTempo = sorted.filter((i) => i.tempo != null);
  const first = sorted[0], latest = sorted[sorted.length - 1], prev = sorted[sorted.length - 2];
  const W = 290, H = 80;
  const x = (i: number) => (i / Math.max(1, withTempo.length - 1)) * W + 5;
  const y = (t: number) => H - ((Math.max(1.5, Math.min(4.5, t)) - 1.5) / 3) * 70;
  const latestMs = new Date(latest.date).getTime();
  const days = (latestMs - new Date(first.date).getTime()) / 86400000;
  const span = days >= 14 ? `${Math.round(days / 7)} weeks` : `${Math.max(1, Math.round(days))} day${Math.round(days) === 1 ? "" : "s"}`;
  const btn: React.CSSProperties = { background: "#FFF", border: "1px solid var(--border)", color: "var(--fairway)", borderRadius: 8, padding: "7px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" };

  // "Then vs now": the swing closest to N months before the latest one.
  const thens = ([[1, "A month ago"], [3, "3 months ago"], [6, "6 months ago"], [12, "A year ago"]] as [number, string][])
    .map(([n, label]) => {
      const target = latestMs - n * MONTH_MS;
      const older = sorted.slice(0, -1);
      if (older.length === 0) return null;
      const best = older.reduce((a, b) => (Math.abs(new Date(a.date).getTime() - target) <= Math.abs(new Date(b.date).getTime() - target) ? a : b));
      const gap = (latestMs - new Date(best.date).getTime()) / MONTH_MS;
      return gap >= n * 0.6 && gap <= n * 1.6 ? { id: best.id, label } : null;
    })
    .filter((v, i, a): v is { id: string; label: string } => !!v && a.findIndex((o) => o && o.id === v.id) === i);

  // Monthly recap: the latest video's month against the month before it.
  const ym = (d: string) => { const t = new Date(d); return t.getFullYear() * 12 + t.getMonth(); };
  const thisKey = ym(latest.date);
  const thisMonth = sorted.filter((i) => ym(i.date) === thisKey);
  const lastMonth = sorted.filter((i) => ym(i.date) === thisKey - 1);
  const thisTempo = avg(thisMonth.filter((i) => i.tempo != null).map((i) => i.tempo as number));
  const lastTempo = avg(lastMonth.filter((i) => i.tempo != null).map((i) => i.tempo as number));
  const monthName = new Date(latest.date).toLocaleDateString(undefined, { month: "long", year: "numeric" });

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
      <div style={{ background: "#FFF", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 12px", marginBottom: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>{monthName} recap</div>
        <div style={{ fontSize: 13 }}>
          {thisMonth.length} video{thisMonth.length === 1 ? "" : "s"} this month
          {lastMonth.length > 0 ? ` (${lastMonth.length} the month before)` : ""}.
        </div>
        {thisTempo != null && (
          <div style={{ fontSize: 13, marginTop: 2 }}>
            Average tempo <strong>{thisTempo.toFixed(1)} : 1</strong>
            {lastTempo != null && <> vs <strong>{lastTempo.toFixed(1)} : 1</strong> last month</>}
            {lastTempo != null && Math.abs(thisTempo - 3) < Math.abs(lastTempo - 3) - 0.05 && <span style={{ color: "#2E7D4F", fontWeight: 700 }}> · closer to tour tempo (3 : 1)</span>}
          </div>
        )}
        {lastMonth.length > 0 && (
          <button style={{ ...btn, marginTop: 8 }} onClick={() => onCompare(lastMonth[lastMonth.length - 1].id, latest.id)}>Last month vs now</button>
        )}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button style={btn} onClick={() => onCompare(first.id, latest.id)}>First vs latest</button>
        {sorted.length > 2 && <button style={btn} onClick={() => onCompare(prev.id, latest.id)}>Previous vs latest</button>}
        {thens.map((t) => <button key={t.id} style={btn} onClick={() => onCompare(t.id, latest.id)}>{t.label} vs now</button>)}
      </div>
    </div>
  );
}
