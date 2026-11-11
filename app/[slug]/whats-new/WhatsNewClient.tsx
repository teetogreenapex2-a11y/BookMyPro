"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { FAKE_TAB_BAR_HEIGHT } from "@/app/components/FakeNativeTabBar";
import { markSeen, type ChangeEntry } from "@/lib/changelog";

export default function WhatsNewClient({ entries, role, basePath }: { entries: ChangeEntry[]; role: string; basePath: string }) {
  useEffect(() => { markSeen(entries[0]?.id ?? null); }, [entries]);
  const native = typeof window !== "undefined" && Capacitor.isNativePlatform();
  const back = role === "player" ? `${basePath}/book` : `${basePath}/instructor`;
  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: `24px 20px ${60 + (native ? FAKE_TAB_BAR_HEIGHT : 0)}px` }}>
      <a href={back} style={{ fontSize: 13, color: "var(--muted)", textDecoration: "none" }}>← Back</a>
      <h1 style={{ fontSize: 28, margin: "10px 0 4px" }}>What's new</h1>
      <p style={{ color: "var(--muted)", fontSize: 14, margin: "0 0 20px" }}>The latest updates to BookMyPro.</p>
      {entries.length === 0 && <p style={{ color: "var(--muted)" }}>Nothing yet - check back soon.</p>}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {entries.map((e, i) => (
          <div key={e.id} style={{ background: "#FFF", border: `1px solid ${i === 0 ? "var(--fairway)" : "var(--border)"}`, borderRadius: 12, padding: "14px 16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline", marginBottom: 4 }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{e.title}</div>
              {i === 0 && <span style={{ fontSize: 10, fontWeight: 700, color: "#FFF", background: "var(--fairway)", borderRadius: 999, padding: "2px 8px" }}>NEW</span>}
            </div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8 }}>{e.date}</div>
            <div style={{ fontSize: 14, lineHeight: 1.55 }}>{e.text}</div>
          </div>
        ))}
      </div>
    </main>
  );
}
