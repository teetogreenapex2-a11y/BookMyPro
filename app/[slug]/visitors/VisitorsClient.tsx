"use client";

import { useCallback, useEffect, useState } from "react";

type VPage = { path: string; at: string; lastAt: string };
type Visit = {
  id: string; source: string; city: string; region: string; country: string; referrer: string;
  pages: VPage[]; startedAt: string; lastSeenAt: string;
};

const LIVE_MS = 45 * 1000; // heartbeat is ~15s, so 45s of silence = gone

function dur(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}
function ago(ms: number) {
  const s = Math.round(ms / 1000);
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  return `${Math.round(h / 24)} d ago`;
}
function pretty(path: string) {
  if (path === "/" || path === "") return "Home page";
  return path.replace(/^BookMyPro\s*/, "BookMyPro ").replace(/^\//, "");
}

export default function VisitorsClient({ basePath, apiBase }: { basePath: string; apiBase: string }) {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [serverNow, setServerNow] = useState<number>(Date.now());
  const [days, setDays] = useState(7);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/visitors?days=${days}`, { cache: "no-store" });
      if (!res.ok) { setError("Couldn't load visitors."); return; }
      const data = await res.json();
      setVisits(data.visits || []);
      setServerNow(new Date(data.now).getTime());
      setError("");
    } catch { setError("Couldn't load visitors."); }
    finally { setLoading(false); }
  }, [apiBase, days]);

  useEffect(() => {
    load();
    const t = setInterval(() => { if (document.visibilityState === "visible") load(); }, 10000);
    return () => clearInterval(t);
  }, [load]);

  const live = visits.filter((v) => serverNow - new Date(v.lastSeenAt).getTime() < LIVE_MS);

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "20px 16px 90px", color: "var(--ink, #1c2a20)" }}>
      <a href={`${basePath}/instructor`} style={{ fontSize: 13, color: "#4A5147", textDecoration: "none" }}>← Dashboard</a>
      <h1 style={{ fontSize: 24, margin: "8px 0 4px" }}>Visitors</h1>
      <p style={{ fontSize: 13.5, color: "#4A5147", margin: "0 0 14px" }}>
        People on your website and booking pages who aren&apos;t signed in. Updates every few seconds.
      </p>

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <span style={{
          fontSize: 13, fontWeight: 700, padding: "5px 12px", borderRadius: 999,
          background: live.length ? "#E3F2E7" : "#EEF0EC", color: live.length ? "#1E6B3A" : "#4A5147",
        }}>
          <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", marginRight: 6, background: live.length ? "#2E9E52" : "#A9B0A6" }} />
          {live.length} on right now
        </span>
        <select value={days} onChange={(e) => setDays(parseInt(e.target.value, 10))}
          style={{ marginLeft: "auto", fontSize: 13, padding: "5px 8px", borderRadius: 8, border: "1px solid #C9CFC6", background: "#fff" }}>
          <option value={1}>Last 24 hours</option>
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
        </select>
      </div>

      {error && <p style={{ color: "#B3261E", fontSize: 13 }}>{error}</p>}
      {loading && <p style={{ fontSize: 13.5, color: "#4A5147" }}>Loading…</p>}
      {!loading && visits.length === 0 && (
        <p style={{ fontSize: 14, color: "#4A5147" }}>No visitors yet in this period. They&apos;ll show up here as soon as someone opens your site.</p>
      )}

      <div style={{ display: "grid", gap: 10 }}>
        {visits.map((v) => {
          const isLive = serverNow - new Date(v.lastSeenAt).getTime() < LIVE_MS;
          const started = new Date(v.startedAt).getTime();
          const total = new Date(v.lastSeenAt).getTime() - started;
          const where = [v.city, v.region || v.country].filter(Boolean).join(", ") || "Unknown location";
          let from = "";
          try { if (v.referrer) from = new URL(v.referrer).hostname.replace(/^www\./, ""); } catch {}
          const isOpen = open === v.id;
          return (
            <div key={v.id} style={{ background: "#fff", border: "1px solid #DDE2DA", borderRadius: 12, padding: "12px 14px" }}>
              <button onClick={() => setOpen(isOpen ? null : v.id)}
                style={{ all: "unset", cursor: "pointer", display: "block", width: "100%" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 9, height: 9, borderRadius: "50%", background: isLive ? "#2E9E52" : "#B9BFB6", flex: "none" }} />
                  <strong style={{ fontSize: 15 }}>{where}</strong>
                  <span style={{ marginLeft: "auto", fontSize: 12.5, color: "#4A5147" }}>
                    {isLive ? "On now" : ago(serverNow - new Date(v.lastSeenAt).getTime())}
                  </span>
                </div>
                <div style={{ fontSize: 13, color: "#4A5147", marginTop: 4 }}>
                  {v.pages.length} {v.pages.length === 1 ? "page" : "pages"} · {dur(total)} on site
                  {from ? ` · from ${from}` : ""}{v.source === "bookmypro" ? " · booking pages" : ""}
                </div>
              </button>
              {isOpen && (
                <ol style={{ margin: "10px 0 0", paddingLeft: 20, fontSize: 13.5, lineHeight: 1.7 }}>
                  {v.pages.map((p, i) => (
                    <li key={i}>
                      {pretty(p.path)} <span style={{ color: "#4A5147" }}>· {dur(new Date(p.lastAt).getTime() - new Date(p.at).getTime())}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
