"use client";

import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { FAKE_TAB_BAR_HEIGHT } from "@/app/components/FakeNativeTabBar";

type Row = { id: string; kind: string; description: string; amountCents: number; status: string; customerName: string | null; customerEmail: string | null; ref: string; createdAt: string };

export default function VenmoClient({ slug, basePath }: { slug: string; basePath: string }) {
  const [pending, setPending] = useState<Row[]>([]);
  const [recent, setRecent] = useState<Row[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const native = typeof window !== "undefined" && Capacitor.isNativePlatform();

  async function load() {
    const r = await fetch(`/api/${slug}/venmo`);
    if (!r.ok) return;
    const d = await r.json();
    setPending(d.pending || []);
    setRecent(d.recent || []);
  }
  useEffect(() => { load(); }, []);

  async function act(id: string, action: "confirm" | "cancel") {
    if (action === "cancel" && !confirm("Cancel this one? Use this if the money never arrived.")) return;
    setBusy(id); setMsg("");
    const r = await fetch(`/api/${slug}/venmo`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action }) });
    const d = await r.json().catch(() => ({}));
    setBusy(null);
    if (!r.ok) { setMsg(d.error || "Something went wrong"); return; }
    setMsg(action === "confirm" ? "Confirmed. The customer has been sent their receipt." : "Cancelled.");
    load();
  }

  const money = (c: number) => `$${(c / 100).toFixed(2)}`;
  const card = { background: "#FFF", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px" } as const;
  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: `24px 20px ${60 + (native ? FAKE_TAB_BAR_HEIGHT : 0)}px` }}>
      <a href={`${basePath}/instructor`} style={{ fontSize: 13, color: "var(--muted)", textDecoration: "none" }}>← Back</a>
      <h1 style={{ fontSize: 28, margin: "10px 0 4px" }}>Venmo payments</h1>
      <p style={{ color: "var(--muted)", fontSize: 14, margin: "0 0 16px" }}>When a customer pays by Venmo, it waits here. Check your Venmo, and when you see the money tap Confirm. That books the lesson, creates the gift card or marks the order paid, and sends the customer their receipt.</p>
      {msg && <div style={{ ...card, marginBottom: 12, fontSize: 14, borderColor: "var(--fairway)" }}>{msg}</div>}
      {pending.length === 0 && <p style={{ color: "var(--muted)" }}>Nothing waiting for you.</p>}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {pending.map((p) => (
          <div key={p.id} style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{p.description}</div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{money(p.amountCents)}</div>
            </div>
            <div style={{ fontSize: 13, color: "var(--muted)", margin: "4px 0 10px" }}>
              {p.customerName || p.customerEmail || "Customer"}{p.customerName && p.customerEmail ? ` · ${p.customerEmail}` : ""} · ref #{p.ref} · {new Date(p.createdAt).toLocaleString()}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button disabled={busy === p.id} onClick={() => act(p.id, "confirm")} style={{ background: "var(--fairway)", color: "#FFF", border: "none", borderRadius: 8, padding: "10px 16px", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>{busy === p.id ? "Working..." : "Confirm - I got it"}</button>
              <button disabled={busy === p.id} onClick={() => act(p.id, "cancel")} style={{ background: "#FFF", color: "#8A2B2B", border: "1px solid #D9B7B7", borderRadius: 8, padding: "10px 16px", fontSize: 14, cursor: "pointer" }}>Cancel</button>
            </div>
          </div>
        ))}
      </div>
      {recent.length > 0 && (
        <>
          <h2 style={{ fontSize: 16, margin: "24px 0 8px" }}>Recent</h2>
          {recent.map((p) => (
            <div key={p.id} style={{ fontSize: 13, color: "var(--muted)", padding: "6px 0", borderTop: "1px solid var(--border)" }}>
              {p.status === "confirmed" ? "✓" : "✕"} {p.description} · {money(p.amountCents)} · {p.customerName || p.customerEmail || "Customer"} · {p.status}
            </div>
          ))}
        </>
      )}
    </main>
  );
}
