"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export type TileOption = { value: string; label: string; price?: string; sub?: string };
export default function TilePicker({ options, value, onPick, title, placeholder, light }: { options: TileOption[]; value: string | null; onPick: (v: string) => void; title: string; placeholder?: string; light?: boolean }) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          width: "100%", maxWidth: light ? undefined : 320, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
          textAlign: "left", background: light ? "#FFF" : "var(--chalk)", color: "var(--fairway)", borderRadius: 8,
          padding: "10px 12px", fontSize: 14, border: current ? "2px solid var(--gold)" : light ? "1px solid var(--border)" : "1px solid rgba(255,255,255,0.3)", cursor: "pointer",
        }}
      >
        <span style={{ fontWeight: current ? 700 : 400 }}>
          {current ? `${current.label}${current.sub ? ` · ${current.sub}` : ""}` : (placeholder || "Choose…")}
          {current?.price && <span className="mono" style={{ color: "var(--gold)", fontWeight: 700 }}>{`  ${current.price}`}</span>}
        </span>
        <span style={{ fontSize: 12, opacity: 0.6 }}>{current ? "Change" : "▾"}</span>
      </button>
      {open && typeof document !== "undefined" && createPortal(
        <div
          onClick={() => setOpen(false)}
          style={{ position: "fixed", inset: 0, zIndex: 100000, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%", maxWidth: 520, maxHeight: "80vh", overflowY: "auto",
              background: "rgba(27,58,47,0.78)", backdropFilter: "blur(22px)", WebkitBackdropFilter: "blur(22px)",
              borderTopLeftRadius: 20, borderTopRightRadius: 20, color: "#fff",
              padding: "16px 16px calc(28px + env(safe-area-inset-bottom))",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{title}</div>
              <button type="button" onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#D7DED9", fontSize: 14 }}>Close</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
              {options.map((o) => {
                const on = value === o.value;
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => { onPick(o.value); setOpen(false); }}
                    style={{
                      textAlign: "left", background: "var(--chalk)", color: "var(--fairway)", borderRadius: 12,
                      padding: "14px 14px", cursor: "pointer",
                      border: on ? "2px solid var(--gold)" : "2px solid transparent",
                    }}
                  >
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{o.label}</div>
                    {o.price && <div className="mono" style={{ fontSize: 15, color: "var(--gold)", fontWeight: 700, marginTop: 3 }}>{o.price}</div>}
                    {o.sub && <div style={{ fontSize: 11.5, opacity: 0.7, marginTop: 3 }}>{o.sub}</div>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

