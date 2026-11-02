"use client";

import { useEffect, useState } from "react";

type Row = { id: string; slug: string; name: string; videoEnabled: boolean };

export default function FeaturesClient() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/features")
      .then((r) => r.json())
      .then((d) => (Array.isArray(d) ? setRows(d) : setError(d.error || "Could not load")))
      .catch(() => setError("Could not load"));
  }, []);

  async function toggle(row: Row) {
    setBusy(row.id);
    setError(null);
    const next = !row.videoEnabled;
    const res = await fetch("/api/admin/features", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: row.id, videoEnabled: next }),
    });
    if (res.ok) setRows((rs) => (rs || []).map((r) => (r.id === row.id ? { ...r, videoEnabled: next } : r)));
    else setError("Could not save that change.");
    setBusy(null);
  }

  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: "24px 16px" }}>
      <h1 style={{ fontSize: 26, margin: "0 0 4px" }}>Business features</h1>
      <p style={{ color: "#5b6b62", margin: "0 0 20px" }}>
        Turn video off for a pro who only wants scheduling and customers. It hides the Videos tab and blocks uploads and the video lesson package.
      </p>
      {error && <p style={{ color: "#b3261e" }}>{error}</p>}
      {!rows && !error && <p>Loading...</p>}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {(rows || []).map((r) => (
          <div key={r.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, border: "1px solid #d5ddd5", borderRadius: 12, padding: "12px 14px", background: "#fff" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</div>
              <div style={{ fontSize: 12.5, color: "#5b6b62" }}>/{r.slug}</div>
            </div>
            <button
              onClick={() => toggle(r)}
              disabled={busy === r.id}
              style={{ border: 0, borderRadius: 999, padding: "9px 16px", fontWeight: 700, cursor: "pointer", background: r.videoEnabled ? "#1b3a2f" : "#e7d9d6", color: r.videoEnabled ? "#fff" : "#7a2a1f", flexShrink: 0 }}
            >
              Video {r.videoEnabled ? "on" : "off"}
            </button>
          </div>
        ))}
      </div>
    </main>
  );
}
