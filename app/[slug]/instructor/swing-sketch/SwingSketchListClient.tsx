"use client";

import { useEffect, useState } from "react";

type Player = { id: string; name: string | null; email: string };
type Sketch = { id: string; imageUrl: string; label: string | null; playerName: string; updatedAt: string };

export default function SwingSketchListClient({ slug, basePath, apiBase }: { slug: string; basePath: string; apiBase: string }) {
  const [sketches, setSketches] = useState<Sketch[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    fetch(`${apiBase}/swing-sketches`).then((r) => r.json()).then((list) => {
      setSketches(Array.isArray(list) ? list : []);
      setLoading(false);
    }).catch(() => setLoading(false));
    fetch(`${apiBase}/players`).then((r) => r.json()).then((list) => setPlayers(Array.isArray(list) ? list : [])).catch(() => {});
  }, [apiBase]);

  return (
    <div style={{ minHeight: "100vh", background: "var(--fairway)" }}>
      <header style={{ padding: "24px 20px", color: "var(--chalk)" }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span className="display" style={{ fontSize: 18, fontWeight: 700 }}>Swing Sketch</span>
            <a href={`${basePath}/instructor`} style={{ fontSize: 13, color: "#D7DED9", textDecoration: "none" }}>
              ← Back to dashboard
            </a>
          </div>
          <h1 className="display" style={{ fontSize: 24, margin: 0 }}>Mark up a swing</h1>
          <p style={{ fontSize: 13, color: "#D7DED9", margin: "4px 0 0" }}>
            Draw directly on a photo — lines, angles, arrows — to show a player exactly what you mean.
          </p>
        </div>
      </header>

      <main style={{ maxWidth: 720, margin: "0 auto", padding: "0 20px 60px", background: "var(--chalk)", borderRadius: "16px 16px 0 0", minHeight: "60vh", paddingTop: 20 }}>
        {!pickerOpen ? (
          <button
            onClick={() => setPickerOpen(true)}
            style={{ background: "var(--fairway)", color: "var(--chalk)", border: "none", borderRadius: 8, padding: "10px 18px", fontSize: 13, fontWeight: 700, marginBottom: 24 }}
          >
            + New sketch
          </button>
        ) : (
          <div style={{ background: "#FFF", border: "1px solid var(--border)", borderRadius: 12, padding: 16, marginBottom: 24 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Who's this for?</div>
            {players.length === 0 ? (
              <p style={{ fontSize: 13, color: "var(--faint)" }}>No players yet — they need to book a lesson first.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {players.map((p) => (
                  <a
                    key={p.id}
                    href={`${basePath}/instructor/swing-sketch/new?playerId=${p.id}`}
                    style={{
                      display: "block", textAlign: "left", background: "var(--card)", border: "1px solid var(--border)",
                      borderRadius: 8, padding: "8px 12px", textDecoration: "none", color: "var(--ink)", fontSize: 13, fontWeight: 600,
                    }}
                  >
                    {p.name || p.email}
                  </a>
                ))}
              </div>
            )}
            <button onClick={() => setPickerOpen(false)} style={{ marginTop: 10, background: "none", border: "none", color: "var(--faint)", fontSize: 12 }}>
              Cancel
            </button>
          </div>
        )}

        <div className="mono" style={{ fontSize: 11, color: "var(--faint)", marginBottom: 8, letterSpacing: "0.04em" }}>
          RECENT SKETCHES
        </div>
        {loading ? (
          <p style={{ fontSize: 13, color: "var(--faint)" }}>Loading…</p>
        ) : sketches.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--faint)" }}>Nothing yet.</p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10 }}>
            {sketches.map((s) => (
              <a
                key={s.id}
                href={`${basePath}/instructor/swing-sketch/${s.id}`}
                style={{ textDecoration: "none", color: "var(--ink)" }}
              >
                <img src={s.imageUrl} alt={s.label || "Swing sketch"} style={{ width: "100%", aspectRatio: "3/2", objectFit: "cover", borderRadius: 8, border: "1px solid var(--border)" }} />
                <div style={{ fontSize: 12, fontWeight: 600, marginTop: 4 }}>{s.label || "Untitled"}</div>
                <div className="mono" style={{ fontSize: 10, color: "var(--faint)" }}>{s.playerName}</div>
              </a>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
