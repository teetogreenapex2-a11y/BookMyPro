"use client";

import { useState } from "react";
import { discountedPrice, discountLabel } from "@/lib/discountMath";

// "Have a discount code?" box shown on the booking page above the pay button.
// The real price is always worked out again on the server at checkout; this
// just tells the customer their code works and what they'll pay.
export default function PromoCodeField({
  apiBase, service, instructorMembershipId, priceCents, value, onChange,
}: {
  apiBase: string;
  service: "lesson" | "fitting";
  instructorMembershipId: string | null;
  priceCents: number;
  value: string;
  onChange: (code: string) => void;
}) {
  const [open, setOpen] = useState(!!value);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  async function apply() {
    if (!value.trim()) return;
    setBusy(true); setResult(null);
    try {
      const r = await fetch(`${apiBase}/discounts/check`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: value, service, instructorMembershipId }),
      });
      const d = await r.json().catch(() => ({}));
      if (d.ok) {
        const { finalCents } = discountedPrice(d.kind, d.value, priceCents);
        onChange(d.code);
        setResult({ ok: true, text: `${discountLabel(d.kind, d.value)} applied - you'll pay $${(finalCents / 100).toFixed(2)}` });
      } else {
        setResult({ ok: false, text: d.error || "That code didn't work" });
      }
    } finally { setBusy(false); }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} style={{ background: "none", border: "none", color: "var(--gold)", fontWeight: 700, fontSize: 13, padding: "0 0 12px", cursor: "pointer" }}>
        Have a discount code?
      </button>
    );
  }
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={value}
          onChange={(e) => { onChange(e.target.value.toUpperCase()); setResult(null); }}
          placeholder="Discount code"
          autoCapitalize="characters"
          className="contact-input"
          style={{ flex: 1, padding: "10px 12px", borderRadius: 8, fontSize: 14, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.06)", color: "var(--chalk)" }}
        />
        <button type="button" onClick={apply} disabled={busy || !value.trim()} style={{ background: "var(--gold)", color: "var(--fairway)", border: "none", borderRadius: 8, padding: "10px 16px", fontWeight: 700, fontSize: 14, opacity: busy || !value.trim() ? 0.6 : 1 }}>
          {busy ? "..." : "Apply"}
        </button>
      </div>
      {result && <div style={{ fontSize: 12.5, marginTop: 6, color: result.ok ? "#9FE0B5" : "#FFB4B4" }}>{result.text}</div>}
    </div>
  );
}
