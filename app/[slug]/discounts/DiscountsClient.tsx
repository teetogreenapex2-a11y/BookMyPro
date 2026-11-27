"use client";

import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { FAKE_TAB_BAR_HEIGHT } from "@/app/components/FakeNativeTabBar";
import { discountLabel } from "@/lib/discountMath";

type Code = { id: string; code: string; kind: string; value: number; appliesTo: string; active: boolean; instructorMembershipId: string | null; instructorName: string | null; used: number; expiresAt: string | null };
type Inst = { id: string; name: string };

const SCOPE: Record<string, string> = { all: "Lessons and fittings", lessons: "Lessons only", fittings: "Fittings only" };

export default function DiscountsClient({ slug, basePath }: { slug: string; basePath: string }) {
  const [codes, setCodes] = useState<Code[]>([]);
  const [instructors, setInstructors] = useState<Inst[]>([]);
  const [isOwner, setIsOwner] = useState(false);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");
  const [kind, setKind] = useState<"percent" | "amount">("percent");
  const [value, setValue] = useState("");
  const [appliesTo, setAppliesTo] = useState("all");
  const [instructorId, setInstructorId] = useState("");
  const [expiresOn, setExpiresOn] = useState("");
  const native = typeof window !== "undefined" && Capacitor.isNativePlatform();

  async function load() {
    const r = await fetch(`/api/${slug}/discounts`);
    if (!r.ok) return;
    const d = await r.json();
    setCodes(d.codes || []); setInstructors(d.instructors || []); setIsOwner(!!d.isOwner);
  }
  useEffect(() => { load(); }, []);

  async function create() {
    setMsg(""); setBusy(true);
    const num = Number(value);
    const r = await fetch(`/api/${slug}/discounts`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code, kind, value: kind === "amount" ? Math.round(num * 100) : Math.round(num), appliesTo,
        instructorMembershipId: instructorId || undefined, expiresOn: expiresOn || undefined,
      }),
    });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setMsg(d.error || "Couldn't save that code"); return; }
    setCode(""); setValue(""); setExpiresOn(""); setMsg("Code created. Tell people to enter it when they book.");
    load();
  }
  async function toggle(c: Code) {
    await fetch(`/api/${slug}/discounts/${c.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: !c.active }) });
    load();
  }
  async function remove(c: Code) {
    if (!confirm(`Delete ${c.code}? People who haven't used it yet won't be able to.`)) return;
    await fetch(`/api/${slug}/discounts/${c.id}`, { method: "DELETE" });
    load();
  }

  const card = { background: "#FFF", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px" } as const;
  const input = { width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 15, background: "#FFF", boxSizing: "border-box" } as const;
  const label = { fontSize: 12, fontWeight: 700, color: "var(--muted)", margin: "10px 0 4px", display: "block" } as const;
  const expired = (c: Code) => !!c.expiresAt && new Date(c.expiresAt).getTime() < Date.now();

  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: `24px 20px ${60 + (native ? FAKE_TAB_BAR_HEIGHT : 0)}px` }}>
      <a href={`${basePath}/instructor`} style={{ fontSize: 13, color: "var(--muted)", textDecoration: "none" }}>← Back</a>
      <h1 style={{ fontSize: 28, margin: "10px 0 4px" }}>Discounts</h1>
      <p style={{ color: "var(--muted)", fontSize: 14, margin: "0 0 16px" }}>
        Make a code worth a percent or a dollar amount off lessons or club fittings. Customers type it in when they book and the new price shows before they pay.
        {!isOwner && " Your codes only work on your own lessons and fittings."}
      </p>

      <div style={{ ...card, marginBottom: 16 }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>New code</div>
        <label style={label}>Code (letters and numbers)</label>
        <input style={input} value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ""))} placeholder="SPRING20" maxLength={24} />
        <label style={label}>Type</label>
        <div style={{ display: "flex", gap: 8 }}>
          {(["percent", "amount"] as const).map((k) => (
            <button key={k} type="button" onClick={() => setKind(k)} style={{ flex: 1, padding: "10px", borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: "pointer", border: kind === k ? "2px solid var(--fairway)" : "1px solid var(--border)", background: kind === k ? "var(--fairway)" : "#FFF", color: kind === k ? "#FFF" : "inherit" }}>
              {k === "percent" ? "% off" : "$ off"}
            </button>
          ))}
        </div>
        <label style={label}>{kind === "percent" ? "Percent off (1-99)" : "Dollars off"}</label>
        <input style={input} value={value} onChange={(e) => setValue(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" placeholder={kind === "percent" ? "20" : "25"} />
        <label style={label}>Works on</label>
        <select style={input} value={appliesTo} onChange={(e) => setAppliesTo(e.target.value)}>
          <option value="all">Lessons and fittings</option>
          <option value="lessons">Lessons only</option>
          <option value="fittings">Fittings only</option>
        </select>
        {isOwner && instructors.length > 1 && (
          <>
            <label style={label}>Which instructor</label>
            <select style={input} value={instructorId} onChange={(e) => setInstructorId(e.target.value)}>
              <option value="">Everyone</option>
              {instructors.map((i) => <option key={i.id} value={i.id}>{i.name} only</option>)}
            </select>
          </>
        )}
        <label style={label}>Last day it works (optional)</label>
        <input style={input} type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} />
        <button disabled={busy || code.length < 3 || !value} onClick={create} style={{ marginTop: 14, width: "100%", background: "var(--fairway)", color: "#FFF", border: "none", borderRadius: 8, padding: "12px 16px", fontWeight: 700, fontSize: 15, cursor: "pointer", opacity: busy || code.length < 3 || !value ? 0.6 : 1 }}>
          {busy ? "Saving..." : "Create code"}
        </button>
        {msg && <div style={{ marginTop: 10, fontSize: 14 }}>{msg}</div>}
        <div style={{ marginTop: 10, fontSize: 12, color: "var(--muted)" }}>Each customer can use a code once. Customers always pay at least $0.50 (the card minimum). For a free lesson, add it manually instead.</div>
      </div>

      {codes.length === 0 && <p style={{ color: "var(--muted)" }}>No codes yet.</p>}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {codes.map((c) => (
          <div key={c.id} style={{ ...card, opacity: c.active && !expired(c) ? 1 : 0.6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <div className="mono" style={{ fontSize: 17, fontWeight: 700 }}>{c.code}</div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{discountLabel(c.kind, c.value)}</div>
            </div>
            <div style={{ fontSize: 13, color: "var(--muted)", margin: "4px 0 10px" }}>
              {SCOPE[c.appliesTo] || SCOPE.all}{c.instructorName ? ` · ${c.instructorName} only` : ""}
              {c.expiresAt ? ` · ${expired(c) ? "expired" : "through"} ${new Date(c.expiresAt).toLocaleDateString()}` : ""}
              {` · used ${c.used} time${c.used === 1 ? "" : "s"}`}
              {!c.active ? " · turned off" : ""}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => toggle(c)} style={{ background: "#FFF", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>{c.active ? "Turn off" : "Turn on"}</button>
              <button onClick={() => remove(c)} style={{ background: "#FFF", color: "#8A2B2B", border: "1px solid #D9B7B7", borderRadius: 8, padding: "8px 14px", fontSize: 13, cursor: "pointer" }}>Delete</button>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
