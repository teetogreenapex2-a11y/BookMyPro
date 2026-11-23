"use client";

import { useEffect, useState } from "react";

type Row = { id: string; name: string | null; email: string; createdAt: string; via: string; businesses: string[] };

export default function SignupsClient() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch("/api/admin/signups").then(async (r) => { if (r.ok) setRows(await r.json()); setLoading(false); });
  }, []);
  const hidden = (e: string) => e.endsWith("@privaterelay.appleid.com") || /^[a-z0-9-]+\.[a-z0-9]+@icloud\.com$/.test(e);
  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "24px 16px" }}>
      <h1 style={{ fontSize: 24, marginBottom: 4 }}>New signups</h1>
      <p style={{ color: "#5C6459", fontSize: 14, marginTop: 0 }}>Newest 100 accounts. You also get a push notification for each new one.</p>
      {loading ? <p>Loading...</p> : rows.length === 0 ? <p>No accounts yet.</p> : rows.map((r) => (
        <div key={r.id} style={{ background: "#FFF", border: "1px solid #E3E6DE", borderRadius: 12, padding: "12px 14px", marginBottom: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
            <strong>{r.name || "(no name)"}</strong>
            <span style={{ color: "#5C6459", fontSize: 13 }}>{new Date(r.createdAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
          </div>
          <div style={{ fontSize: 14, wordBreak: "break-all" }}>{r.email}{hidden(r.email) ? " (Apple hidden email)" : ""}</div>
          <div style={{ fontSize: 13, color: "#5C6459" }}>Signed in with {r.via}{r.businesses.length ? ` · ${r.businesses.join(", ")}` : " · no business yet"}</div>
        </div>
      ))}
    </div>
  );
}
