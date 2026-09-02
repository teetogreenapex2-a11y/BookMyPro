"use client";

import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import { Capacitor } from "@capacitor/core";

type Sketch = {
  id: string;
  imageUrl: string;
  label: string | null;
  createdAt: string;
};

export default function SwingSketchesClient({ slug, basePath, apiBase }: { slug: string; basePath: string; apiBase: string }) {
  const [sketches, setSketches] = useState<Sketch[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Sketch | null>(null);
  // Checking Capacitor.isNativePlatform() directly during render caused a
  // hydration mismatch elsewhere tonight (the server always renders as if
  // it's not native, since it has no way to know) - starting this state
  // at false to match the server, and only updating it after mounting on
  // the client, avoids that entirely.
  const [isNative, setIsNative] = useState(false);
  useEffect(() => {
    setIsNative(Capacitor.isNativePlatform());
  }, []);

  useEffect(() => {
    fetch(`${apiBase}/swing-sketches`)
      .then((r) => r.json())
      .then((list) => {
        setSketches(Array.isArray(list) ? list : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [apiBase]);

  return (
    <div style={{ minHeight: "100vh", background: "var(--chalk)" }}>
      <header style={{ background: "var(--fairway)", color: "var(--chalk)", padding: "24px 20px" }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span className="display" style={{ fontSize: 18, fontWeight: 700 }}>Swing Sketches</span>
            <div style={{ display: "flex", gap: 10 }}>
              {!isNative && (
                <a href={`${basePath}/book`} style={{ fontSize: 13, color: "#D7DED9", textDecoration: "none" }}>Book</a>
              )}
              <button onClick={() => signOut({ callbackUrl: "/login" })} style={{ background: "none", border: "none", color: "#D7DED9", fontSize: 13 }}>
                Sign out
              </button>
            </div>
          </div>
          <h1 className="display" style={{ fontSize: 24, margin: 0 }}>Sketches from your instructor</h1>
          <p style={{ fontSize: 13, color: "#D7DED9", margin: "4px 0 0" }}>
            Illustrated notes your instructor has drawn up to help explain your swing.
          </p>
        </div>
      </header>

      <main style={{ maxWidth: 720, margin: "0 auto", padding: "22px 20px 60px" }}>
        {loading ? (
          <p style={{ color: "var(--muted)", fontSize: 14 }}>Loading...</p>
        ) : sketches.length === 0 ? (
          <p style={{ color: "var(--muted)", fontSize: 14 }}>
            No sketches yet - your instructor will share one here after a lesson.
          </p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            {sketches.map((s) => (
              <button
                key={s.id}
                onClick={() => setSelected(s)}
                style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: 10, textAlign: "left", cursor: "pointer" }}
              >
                <img
                  src={s.imageUrl}
                  alt={s.label || "Swing sketch"}
                  style={{ width: "100%", aspectRatio: "3/2", objectFit: "cover", borderRadius: 8, marginBottom: 8, background: "#000" }}
                />
                <div style={{ fontSize: 13, fontWeight: 700 }}>{s.label || "Swing Sketch"}</div>
                <div style={{ fontSize: 11, color: "var(--faint)" }}>
                  {new Date(s.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                </div>
              </button>
            ))}
          </div>
        )}
      </main>

      {selected && (
        <div
          onClick={() => setSelected(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 50 }}
        >
          <div style={{ maxWidth: 720, width: "100%" }} onClick={(e) => e.stopPropagation()}>
            <img src={selected.imageUrl} alt={selected.label || "Swing sketch"} style={{ width: "100%", borderRadius: 12 }} />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
              <div style={{ color: "#FFF", fontSize: 14, fontWeight: 700 }}>{selected.label || "Swing Sketch"}</div>
              <button
                onClick={() => setSelected(null)}
                style={{ background: "none", border: "1px solid rgba(255,255,255,0.4)", color: "#FFF", borderRadius: 8, padding: "6px 12px", fontSize: 12, cursor: "pointer" }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
