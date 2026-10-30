"use client";

import { useState } from "react";

type Member = { userId: string; email: string; phone: string | null; packages: number; bookings: number; videos: number; hasSignedIn: boolean };
type Group = { name: string; members: Member[] };

export default function MergeClient({ groups, apiBase, basePath }: { groups: Group[]; apiBase: string; basePath: string }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function merge(keep: Member, other: Member, name: string) {
    const ok = window.confirm(
      `Keep ${keep.email} and merge ${other.email} into it?\n\nEverything on ${other.email} (${other.packages} packages, ${other.bookings} bookings, ${other.videos} videos, messages) moves to ${keep.email}, and the ${other.email} record is removed from your customers. This can't be undone.`
    );
    if (!ok) return;
    setBusy(other.userId);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/customers/merge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keepUserId: keep.userId, mergeUserId: other.userId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Merge failed");
      setDone((d) => [...d, other.userId]);
    } catch (e: any) {
      setError(e.message || "Merge failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "24px 20px 120px" }}>
      <a href={`${basePath}/customers`} style={{ fontSize: 13, color: "var(--muted)", textDecoration: "none" }}>&larr; Customers</a>
      <h1 className="display" style={{ fontSize: 24, margin: "10px 0 6px" }}>Merge duplicate customers</h1>
      <p style={{ fontSize: 13.5, color: "var(--muted)", marginTop: 0 }}>
        These customers share a name. Pick the record to <strong>keep</strong> - normally the one marked &ldquo;has signed in,&rdquo; since that is the account they actually use. Everything on the other record moves over to it.
      </p>
      {error && <p style={{ color: "#B23A3A", fontSize: 13 }}>{error}</p>}
      {groups.length === 0 && <p style={{ fontSize: 14 }}>No duplicates found.</p>}
      {groups.map((g) => {
        const live = g.members.filter((m) => !done.includes(m.userId));
        return (
          <div key={g.name} style={{ background: "#FFF", border: "1px solid var(--border)", borderRadius: 12, padding: 14, marginBottom: 14 }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>{g.name}</div>
            {live.length < 2 && <div style={{ fontSize: 13, color: "var(--muted)" }}>Merged.</div>}
            {live.length >= 2 && live.map((m) => (
              <div key={m.userId} style={{ borderTop: "1px solid #EFEBDD", padding: "10px 0" }}>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>{m.email}{m.phone ? ` · ${m.phone}` : ""}</div>
                <div className="mono" style={{ fontSize: 11, color: "var(--muted)", margin: "3px 0 8px" }}>
                  {m.packages} packages · {m.bookings} bookings · {m.videos} videos · {m.hasSignedIn ? "has signed in" : "never signed in"}
                </div>
                <button
                  disabled={!!busy}
                  onClick={() => merge(m, live.find((x) => x.userId !== m.userId)!, g.name)}
                  style={{ background: "var(--fairway)", color: "var(--chalk)", border: "none", borderRadius: 8, padding: "8px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", opacity: busy ? 0.6 : 1 }}
                >
                  {busy ? "Merging..." : "Keep this one, merge the other into it"}
                </button>
              </div>
            ))}
          </div>
        );
      })}
    </main>
  );
}
