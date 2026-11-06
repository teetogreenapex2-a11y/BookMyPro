"use client";

import { useCallback, useEffect, useState } from "react";

type Tier = { label: string; count: number; prize: string; rest?: boolean };
type Board = { title: string; spaceCount: number; maxPerPerson: number; status: string; drawnAt: string | null; giftCardCents: number; giftCardsIssuedAt: string | null; tiers: Tier[] };
type Space = { number: number; name: string; winnerTier: number | null; email?: string; phone?: string | null };

export default function RaffleClient({ apiBase, businessName, isOwner }: { apiBase: string; businessName: string; isOwner: boolean }) {
  const [board, setBoard] = useState<Board | null>(null);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [owner, setOwner] = useState(isOwner);
  const [loading, setLoading] = useState(true);
  const [picked, setPicked] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [adminBusy, setAdminBusy] = useState(false);
  const [adminMsg, setAdminMsg] = useState<string | null>(null);
  const [emailCodes, setEmailCodes] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/raffle`, { cache: "no-store" });
      const d = await res.json();
      setBoard(d.board || null);
      setSpaces(d.spaces || []);
      setOwner(!!d.isOwner);
    } catch {}
    setLoading(false);
  }, [apiBase]);

  useEffect(() => {
    load();
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, [load]);

  const byNumber = new Map(spaces.map((s) => [s.number, s]));
  const taken = spaces.length;
  const drawn = board?.status === "drawn";
  const dollars = (c: number) => `$${(c / 100).toFixed(0)}`;

  async function claim() {
    if (picked == null) return;
    setSaving(true);
    setError(null);
    const res = await fetch(`${apiBase}/raffle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ number: picked, name, email, phone }),
    });
    const d = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setError(d.error || "Something went wrong.");
      if (res.status === 409) load();
      return;
    }
    setNotice(`You have space ${picked}. Good luck! ${d.left > 0 ? `You can claim ${d.left} more.` : "You've used all your spaces."}`);
    setPicked(null);
    load();
  }

  async function admin(action: string, extra: Record<string, unknown> = {}) {
    setAdminBusy(true);
    setAdminMsg(null);
    const res = await fetch(`${apiBase}/raffle/admin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...extra }),
    });
    const d = await res.json().catch(() => ({}));
    setAdminBusy(false);
    if (!res.ok) { setAdminMsg(d.error || "Something went wrong."); return; }
    if (action === "giftcards") setAdminMsg(`Created ${d.created} gift cards${d.emailed ? `, emailed ${d.emailed}` : ""}.`);
    load();
  }

  const input = { width: "100%", border: "1px solid var(--border)", borderRadius: 8, padding: "11px 12px", fontSize: 15, marginBottom: 10, fontFamily: "inherit", boxSizing: "border-box" } as const;
  const restIndex = board ? board.tiers.findIndex((t) => t.rest) : -1;

  return (
    <div style={{ minHeight: "100vh", background: "var(--chalk)", paddingBottom: "calc(120px + env(safe-area-inset-bottom, 0px))" }}>
      <header style={{ background: "var(--fairway)", color: "var(--chalk)", padding: "24px 20px" }}>
        <div style={{ maxWidth: 760, margin: "0 auto" }}>
          <div style={{ fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase", color: "#BFE3CC", marginBottom: 6 }}>{businessName}</div>
          <h1 className="display" style={{ fontSize: 28, margin: "0 0 6px" }}>{board?.title || "Raffle"}</h1>
          {board && (
            <p style={{ margin: 0, fontSize: 13.5, color: "#D7E4DB", lineHeight: 1.5 }}>
              Pick a numbered space and enter your name and email. Limit {board.maxPerPerson} spaces per person. When all {board.spaceCount} spaces are claimed, the winners are drawn at random. Everyone who doesn't win a prize gets a {dollars(board.giftCardCents)} gift card.
            </p>
          )}
          {board && (
            <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
              {[[String(taken), "Claimed"], [String(board.spaceCount - taken), "Open"], [drawn ? "Drawn" : "Open", "Status"]].map(([n, l]) => (
                <div key={l} style={{ flex: "1 1 90px", background: "rgba(255,255,255,0.09)", border: "1px solid rgba(255,255,255,0.16)", borderRadius: 10, padding: "9px 12px" }}>
                  <div className="display" style={{ fontSize: 22 }}>{n}</div>
                  <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "#BFE3CC" }}>{l}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </header>

      <main style={{ maxWidth: 760, margin: "0 auto", padding: "20px 20px 0" }}>
        {loading && <p style={{ color: "var(--muted)" }}>Loading…</p>}
        {!loading && !board && (
          <div style={{ background: "#FFF", border: "1px solid var(--border)", borderRadius: 12, padding: 24, textAlign: "center", color: "var(--muted)" }}>
            There's no raffle running right now. Check back soon.
          </div>
        )}

        {notice && (
          <div style={{ background: "#E3F4E8", color: "#1F6B3A", borderRadius: 10, padding: "12px 14px", fontSize: 14, fontWeight: 600, marginBottom: 14 }}>{notice}</div>
        )}

        {board && (
          <>
            <div style={{ background: "#FFF", border: "1px solid var(--border)", borderRadius: 12, padding: 16, marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Prizes</div>
              {board.tiers.map((t, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "6px 0", borderTop: i ? "1px solid var(--border)" : "none", fontSize: 14 }}>
                  <span style={{ fontWeight: 600 }}>{t.label}<span style={{ fontWeight: 400, color: "var(--muted)", fontSize: 12 }}> · {t.rest ? "every other space" : `${t.count} winner${t.count === 1 ? "" : "s"}`}</span></span>
                  <span style={{ textAlign: "right" }}>{t.rest ? `${dollars(board.giftCardCents)} gift card` : t.prize}</span>
                </div>
              ))}
            </div>

            <div style={{ background: "#FFF", border: "1px solid var(--border)", borderRadius: 12, padding: 16, marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 6 }}>
                <div style={{ fontSize: 15, fontWeight: 700 }}>{drawn ? "Final board" : "Pick your space"}</div>
                <div style={{ fontSize: 12, color: "var(--muted)" }}>{drawn ? "Winners are highlighted" : "Tap an open space"}</div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(92px, 1fr))", gap: 8 }}>
                {Array.from({ length: board.spaceCount }, (_, i) => i + 1).map((n) => {
                  const s = byNumber.get(n);
                  const prize = s && s.winnerTier != null && s.winnerTier !== restIndex;
                  const tierLabel = prize ? board.tiers[s!.winnerTier!]?.label : null;
                  const open = !s && !drawn;
                  return (
                    <button
                      key={n}
                      disabled={!open}
                      onClick={() => { setPicked(n); setError(null); setNotice(null); }}
                      style={{
                        minHeight: 72, borderRadius: 10, padding: "6px 4px", textAlign: "center", fontFamily: "inherit",
                        border: prize ? "2px solid var(--gold)" : s ? "1.5px solid var(--fairway)" : "1.5px solid var(--border)",
                        background: prize ? "#F5E7C2" : s ? "#FFF" : "var(--open)",
                        cursor: open ? "pointer" : "default", color: "var(--ink)",
                      }}
                    >
                      <div className="display" style={{ fontSize: 16, fontWeight: 600, color: s ? "var(--fairway)" : "var(--muted)" }}>{n}</div>
                      {s ? <div style={{ fontSize: 11.5, fontWeight: 700, marginTop: 2, overflowWrap: "anywhere" }}>{s.name}</div> : <div style={{ fontSize: 11, fontStyle: "italic", color: "var(--muted)", marginTop: 2 }}>{drawn ? "" : "Open"}</div>}
                      {tierLabel && <div style={{ fontSize: 9.5, fontWeight: 700, textTransform: "uppercase", color: "#A9791E", marginTop: 2 }}>{tierLabel}</div>}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {owner && board && (
          <div style={{ background: "#FFF", border: "2px solid var(--gold)", borderRadius: 12, padding: 16, marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Owner controls</div>
            <p style={{ fontSize: 12, color: "var(--muted)", margin: "0 0 12px" }}>Only you see this. Customers can claim spaces but can't draw, release or reset.</p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
              <button
                disabled={adminBusy || drawn || taken < board.spaceCount}
                onClick={() => { if (window.confirm("Draw the winners now? This can't be undone.")) admin("draw"); }}
                style={{ background: "var(--fairway)", color: "var(--chalk)", border: "none", borderRadius: 8, padding: "10px 14px", fontSize: 13, fontWeight: 700, opacity: adminBusy || drawn || taken < board.spaceCount ? 0.45 : 1 }}
              >
                {drawn ? "Winners drawn" : taken < board.spaceCount ? `Draw unlocks when full (${board.spaceCount - taken} to go)` : "Draw winners"}
              </button>
              {drawn && !board.giftCardsIssuedAt && (
                <>
                  <button
                    disabled={adminBusy}
                    onClick={() => { if (window.confirm(`Create a ${dollars(board.giftCardCents)} gift card for every non-prize space?`)) admin("giftcards", { sendEmail: emailCodes }); }}
                    style={{ background: "var(--gold)", color: "#2A2107", border: "none", borderRadius: 8, padding: "10px 14px", fontSize: 13, fontWeight: 700 }}
                  >
                    Create gift cards
                  </button>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5 }}>
                    <input type="checkbox" checked={emailCodes} onChange={(e) => setEmailCodes(e.target.checked)} /> Email the codes
                  </label>
                </>
              )}
              {board.giftCardsIssuedAt && <span style={{ fontSize: 12.5, color: "#1F6B3A", fontWeight: 700, alignSelf: "center" }}>Gift cards created</span>}
              <button
                disabled={adminBusy}
                onClick={() => { if (window.confirm("Reset the whole raffle? This clears every claimed space and any winners.")) admin("reset"); }}
                style={{ background: "none", color: "#B23A3A", border: "1px solid #B23A3A", borderRadius: 8, padding: "10px 14px", fontSize: 13, fontWeight: 700 }}
              >
                Reset
              </button>
            </div>
            {adminMsg && <p style={{ fontSize: 12.5, color: adminMsg.startsWith("Created") ? "#1F6B3A" : "#B23A3A", margin: "0 0 10px" }}>{adminMsg}</p>}

            {spaces.length > 0 && (
              <div style={{ fontSize: 12.5 }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Claimed spaces</div>
                {spaces.map((s) => (
                  <div key={s.number} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "5px 0", borderTop: "1px solid var(--border)", alignItems: "center" }}>
                    <span style={{ minWidth: 0, overflowWrap: "anywhere" }}><strong>#{s.number}</strong> {s.name} · {s.email}{s.phone ? ` · ${s.phone}` : ""}</span>
                    {!drawn && (
                      <button onClick={() => { if (window.confirm(`Release space ${s.number}?`)) admin("release", { number: s.number }); }} disabled={adminBusy}
                        style={{ background: "none", border: "1px solid var(--border)", borderRadius: 6, fontSize: 11, padding: "3px 8px", flexShrink: 0 }}>Release</button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {picked != null && board && (
        <div onClick={() => setPicked(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", overflowY: "auto", WebkitOverflowScrolling: "touch", zIndex: 10000 }}>
          {/* Sits at the top of the screen (not the bottom) so neither the tab bar nor the phone keyboard can cover the fields; scrolls if the screen is short. */}
          <div onClick={(e) => e.stopPropagation()} style={{ width: "calc(100% - 32px)", maxWidth: 480, background: "#FFF", borderRadius: 18, padding: "20px 20px 24px", margin: "16px auto 40vh" }}>
            <div className="display" style={{ fontSize: 20, marginBottom: 4 }}>Claim space {picked}</div>
            <p style={{ fontSize: 12.5, color: "var(--muted)", margin: "0 0 14px" }}>We use your email to count your spaces (limit {board.maxPerPerson}) and to send your prize or gift card. Other people only see your first name and last initial.</p>
            <input id="raffle-name" onFocus={(e) => setTimeout(() => e.target.scrollIntoView({ block: "center", behavior: "smooth" }), 300)} style={input} placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
            <input id="raffle-email" onFocus={(e) => setTimeout(() => e.target.scrollIntoView({ block: "center", behavior: "smooth" }), 300)} style={input} placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            <input id="raffle-phone" onFocus={(e) => setTimeout(() => e.target.scrollIntoView({ block: "center", behavior: "smooth" }), 300)} style={input} placeholder="Phone (optional)" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
            {error && <p style={{ fontSize: 13, color: "#B23A3A", margin: "0 0 10px" }}>{error}</p>}
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setPicked(null)} style={{ flex: 1, background: "none", border: "1px solid var(--border)", borderRadius: 8, padding: 12, fontSize: 14, fontWeight: 600 }}>Cancel</button>
              <button onClick={claim} disabled={saving || !name.trim() || !email.trim()} style={{ flex: 2, background: "var(--fairway)", color: "var(--chalk)", border: "none", borderRadius: 8, padding: 12, fontSize: 14, fontWeight: 700, opacity: saving ? 0.7 : 1 }}>
                {saving ? "Claiming…" : `Claim space ${picked}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
