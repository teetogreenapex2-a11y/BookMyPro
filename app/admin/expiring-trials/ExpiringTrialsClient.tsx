"use client";

import { useEffect, useState } from "react";

type ExpiredTrial = { id: string; slug: string; name: string; trialEndsAt: string; ownerName: string | null; ownerEmail: string | null };

function daysAgo(dateStr: string) {
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
  return days <= 0 ? "today" : days === 1 ? "1 day ago" : `${days} days ago`;
}

export default function ExpiringTrialsClient() {
  const [businesses, setBusinesses] = useState<ExpiredTrial[]>([]);
  const [loading, setLoading] = useState(true);
  const [responding, setResponding] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/admin/expiring-trials");
    if (res.ok) setBusinesses(await res.json());
    setLoading(false);
  }

  async function respond(id: string, name: string, action: "extend" | "delete") {
    if (action === "delete") {
      const confirmed = window.confirm(
        `Permanently delete "${name}"? This removes every booking, customer, message, and dollar of history tied to it. This cannot be undone.`
      );
      if (!confirmed) return;
    }
    setResponding(id);
    const res = await fetch(`/api/admin/expiring-trials/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setResponding(null);
    if (res.ok) setBusinesses((prev) => prev.filter((b) => b.id !== id));
  }

  return (
    <div style={{ minHeight: "100vh", background: "#F6F4EE", padding: 24, fontFamily: "sans-serif" }}>
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: "#B8862B", marginBottom: 8 }}>BOOKMYPRO ADMIN</div>
        <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 26, color: "#1B3A2F", margin: "0 0 20px" }}>Expired trials</h1>

        {loading ? (
          <p style={{ color: "#5C6459" }}>Loading...</p>
        ) : businesses.length === 0 ? (
          <p style={{ color: "#5C6459" }}>Nothing awaiting a decision right now.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {businesses.map((b) => (
              <div key={b.id} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10,
                background: "#FFF", border: "1px solid #E3D9C9", borderRadius: 10, padding: "12px 16px",
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#1B3A2F" }}>{b.name}</div>
                  <div style={{ fontSize: 12, color: "#8A8571" }}>{b.slug}</div>
                  <div style={{ fontSize: 12, color: "#5C6459", marginTop: 2 }}>
                    {b.ownerName || "(no name)"} &lt;{b.ownerEmail}&gt;
                  </div>
                  <div style={{ fontSize: 11, color: "#B23A3A", marginTop: 2, fontWeight: 600 }}>
                    Trial ended {daysAgo(b.trialEndsAt)}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  <button
                    onClick={() => respond(b.id, b.name, "delete")}
                    disabled={responding === b.id}
                    style={{ background: "#FBE9E9", color: "#B23A3A", border: "none", borderRadius: 6, padding: "7px 12px", fontWeight: 700, fontSize: 12 }}
                  >
                    Delete everything
                  </button>
                  <button
                    onClick={() => respond(b.id, b.name, "extend")}
                    disabled={responding === b.id}
                    style={{ background: "#1B3A2F", color: "#F6F4EE", border: "none", borderRadius: 6, padding: "7px 12px", fontWeight: 700, fontSize: 12 }}
                  >
                    Give 7 more days
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
