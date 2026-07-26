"use client";

import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";

type Sketch = { id: string; imageUrl: string; label: string | null; instructorName: string | null; createdAt: string };

export default function SwingSketchesPlayerClient({ slug, basePath, apiBase }: { slug: string; basePath: string; apiBase: string }) {
  const [sketches, setSketches] = useState<Sketch[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${apiBase}/swing-sketches`).then((r) => r.json()).then((list) => {
      setSketches(Array.isArray(list) ? list : []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [apiBase]);

  return (
    <div style={{ minHeight: "100vh" }}>
      <header style={{ background: "var(--fairway)", color: "var(--chalk)", padding: "24px 20px" }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span className="display" style={{ fontSize: 18, fontWeight: 700 }}>Swing Sketches</span>
            <div style={{ display: "flex", gap: 10 }}>
              <a href={`${basePath}/book`} style={{ fontSize: 13, color: "#D7DED9", textDecoration: "none" }}>Book</a>
              <button onClick={() => signOut({ callbackUrl: "/login" })} style={{ background: "none", border: "none", color: "#D7DED9", fontSize: 13 }}>
                Sign out
              </button>
            </div>
          </div>
          <h1 className="display" style={{ fontSize: 24, margin: 0 }}>What your instructor's drawn up</h1>
        </div>
      </header>

      <main style={{ maxWidth: 720, margin: "0 auto", padding: "22px 20px 60px" }}>
        {loading ? (
          <p style={{ fontSize: 13, color: "var(--faint)" }}>Loading…</p>
        ) : sketches.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--faint)" }}>Nothing here yet — your instructor can mark up a swing during or after a lesson.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {sketches.map((s) => (
              <div key={s.id} style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: 14 }}>
                <div
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
                  onClick={() => setOpenId(openId === s.id ? null : s.id)}
                >
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{s.label || "Untitled sketch"}</div>
                    <div className="mono" style={{ fontSize: 11, color: "var(--faint)" }}>
                      from {s.instructorName || "your instructor"} · {new Date(s.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                </div>
                {openId === s.id && (
                  <img src={s.imageUrl} alt={s.label || "Swing sketch"} style={{ width: "100%", borderRadius: 8, marginTop: 10, border: "1px solid var(--border)" }} />
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
