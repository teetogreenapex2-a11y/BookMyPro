"use client";

import { useEffect, useState } from "react";

// Where this instructor takes Venmo, Cash App and Zelle payments. Customers
// with a payment due see tap-to-pay buttons built from these. BookMyPro
// never touches the money; the instructor marks the package paid afterward.
export default function PayHandlesCard({ apiBase }: { apiBase: string }) {
  const [venmo, setVenmo] = useState("");
  const [cashApp, setCashApp] = useState("");
  const [zelle, setZelle] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${apiBase}/my-pay-handles`)
      .then((r) => r.json())
      .then((d) => { setVenmo(d.venmoHandle || ""); setCashApp(d.cashAppHandle || ""); setZelle(d.zelleContact || ""); })
      .catch(() => {});
  }, [apiBase]);

  async function save() {
    setSaving(true);
    setMsg(null);
    const res = await fetch(`${apiBase}/my-pay-handles`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ venmoHandle: venmo, cashAppHandle: cashApp, zelleContact: zelle }),
    });
    setSaving(false);
    setMsg(res.ok ? "Saved." : "Could not save.");
  }

  const input = { flex: 1, minWidth: 0, border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px", fontSize: 14, fontFamily: "inherit" } as const;
  const row = { display: "flex", alignItems: "center", gap: 8, marginBottom: 8 } as const;
  const label = { fontSize: 12, width: 70, color: "var(--faint)" } as const;

  return (
    <div style={{ background: "#FFF", border: "1px solid var(--border)", borderRadius: 12, padding: 16, marginBottom: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Get paid by Venmo, Cash App or Zelle</div>
      <p style={{ fontSize: 12, color: "var(--faint)", margin: "0 0 12px" }}>
        Customers who owe you money see these as pay buttons. BookMyPro doesn't handle the payment. After they pay, tap Mark as paid on their package and pick how they paid.
      </p>
      <div style={row}><label style={label} htmlFor="pay-venmo">Venmo</label><input id="pay-venmo" style={input} placeholder="username (no @)" value={venmo} onChange={(e) => setVenmo(e.target.value)} /></div>
      <div style={row}><label style={label} htmlFor="pay-cashapp">Cash App</label><input id="pay-cashapp" style={input} placeholder="cashtag (no $)" value={cashApp} onChange={(e) => setCashApp(e.target.value)} /></div>
      <div style={row}><label style={label} htmlFor="pay-zelle">Zelle</label><input id="pay-zelle" style={input} placeholder="phone or email" value={zelle} onChange={(e) => setZelle(e.target.value)} /></div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button onClick={save} disabled={saving} style={{ background: "var(--fairway)", color: "var(--chalk)", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          {saving ? "Saving…" : "Save payment options"}
        </button>
        {msg && <span style={{ fontSize: 12, color: "var(--faint)" }}>{msg}</span>}
      </div>
    </div>
  );
}
