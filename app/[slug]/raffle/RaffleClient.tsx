"use client";

import { useCallback, useEffect, useState } from "react";

type Tier = { label: string; count: number; prize: string; rest?: boolean };
type Board = { title: string; spaceCount: number; maxPerPerson: number; status: string; drawnAt: string | null; giftCardCents: number; priceCents: number; giftCardsIssuedAt: string | null; tiers: Tier[] };
type PendingVenmo = { groupId: string; name: string; email: string; phone: string | null; numbers: number[]; amountCents: number };
type VenmoInfo = { url: string; handle: string; amountCents: number; note: string; numbers: number[] };
type Space = { number: number; name: string; held?: boolean; winnerTier: number | null; email?: string; phone?: string | null };

export default function RaffleClient({ apiBase, businessName, isOwner, boardKey = "main" }: { apiBase: string; businessName: string; isOwner: boolean; boardKey?: string }) {
  const [board, setBoard] = useState<Board | null>(null);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [owner, setOwner] = useState(isOwner);
  const [raffleBase, setRaffleBase] = useState("");
  const [loading, setLoading] = useState(true);
  const [picked, setPicked] = useState<number[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [method, setMethod] = useState<"card" | "venmo">("card");
  const [venmoAvailable, setVenmoAvailable] = useState(false);
  const [pendingVenmo, setPendingVenmo] = useState<PendingVenmo[]>([]);
  const [venmoInfo, setVenmoInfo] = useState<VenmoInfo | null>(null);
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
      const sid = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("sid") : null;
      const res = await fetch(`${apiBase}/raffle?key=${boardKey}${sid ? `&sid=${encodeURIComponent(sid)}` : ""}`, { cache: "no-store" });
      const d = await res.json();
      setBoard(d.board || null);
      setSpaces(d.spaces || []);
      setOwner(!!d.isOwner);
      setVenmoAvailable(!!d.venmoAvailable);
      setPendingVenmo(d.pendingVenmo || []);
      // Drop selections that someone else took in the meantime.
      const taken = new Set<number>((d.spaces || []).map((x: Space) => x.number));
      setPicked((cur) => cur.filter((n) => !taken.has(n)));
    } catch {}
    setLoading(false);
  }, [apiBase, boardKey]);

  useEffect(() => {
    if (typeof window !== "undefined") setRaffleBase(window.location.pathname.replace(/\/raffle(\/.*)?$/, "/raffle"));
    if (typeof window !== "undefined" && window.location.search.includes("paid=1")) {
      setNotice("Thanks! Confirming your payment - your space will show as yours in a moment.");
    }
    load();
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, [load]);

  const byNumber = new Map(spaces.map((s) => [s.number, s]));
  const taken = spaces.filter((s) => !s.held).length;
  const drawn = board?.status === "drawn";
  const dollars = (c: number) => `$${(c / 100).toFixed(0)}`;

  async function claim() {
    if (picked.length === 0) return;
    setSaving(true);
    setError(null);
    const res = await fetch(`${apiBase}/raffle?key=${boardKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ numbers: picked, name, email, phone, method }),
    });
    const d = await res.json().catch(() => ({}));
    // Going to Stripe: keep the button disabled so a second tap can't start a second payment.
    if (res.ok && d.url) { window.location.href = d.url; return; }
    setSaving(false);
    if (!res.ok) {
      setError(d.error || "Something went wrong.");
      if (res.status === 409) load();
      return;
    }
    if (d.venmo) {
      setVenmoInfo(d.venmo);
      setFormOpen(false);
      setPicked([]);
      load();
      return;
    }
    const mine = [...picked].sort((a, b) => a - b).join(", ");
    setNotice(`You have space${picked.length === 1 ? "" : "s"} ${mine}. Good luck! ${d.left > 0 ? `You can claim ${d.left} more.` : "You've used all your spaces."}`);
    setPicked([]);
    setFormOpen(false);
    load();
  }

  async function admin(action: string, extra: Record<string, unknown> = {}) {
    setAdminBusy(true);
    setAdminMsg(null);
    const res = await fetch(`${apiBase}/raffle/admin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, key: boardKey, ...extra }),
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
          {owner && raffleBase && (
            <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
              {[{ k: "main", label: "50/50 Raffle", href: raffleBase }, { k: "200", label: "200/20 Raffle", href: `${raffleBase}/200` }].map((t) => (
                <a key={t.k} href={t.href} style={{ padding: "7px 14px", borderRadius: 999, fontSize: 13, fontWeight: 700, textDecoration: "none", background: boardKey === t.k ? "var(--chalk)" : "rgba(255,255,255,0.14)", color: boardKey === t.k ? "var(--fairway)" : "var(--chalk)" }}>{t.label}</a>
              ))}
            </div>
          )}
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
                <div style={{ fontSize: 12, color: "var(--muted)" }}>{drawn ? "Winners are highlighted" : `${dollars(board.priceCents)} per space · tap up to ${board.maxPerPerson}`}</div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${board.spaceCount > 60 ? 70 : 92}px, 1fr))`, gap: 8 }}>
                {Array.from({ length: board.spaceCount }, (_, i) => i + 1).map((n) => {
                  const s = byNumber.get(n);
                  const prize = s && s.winnerTier != null && s.winnerTier !== restIndex;
                  const tierLabel = prize ? board.tiers[s!.winnerTier!]?.label : null;
                  const open = !s && !drawn;
                  return (
                    <button
                      key={n}
                      disabled={!open}
                      onClick={() => { setNotice(null); setError(null); setPicked((cur) => cur.includes(n) ? cur.filter((x) => x !== n) : cur.length >= (board?.maxPerPerson || 3) ? cur : [...cur, n]); }}
                      style={{
                        minHeight: board.spaceCount > 60 ? 58 : 72, borderRadius: 10, padding: "6px 4px", textAlign: "center", fontFamily: "inherit",
                        border: picked.includes(n) ? "3px solid var(--fairway)" : prize ? "2px solid var(--gold)" : s ? "1.5px solid var(--fairway)" : "1.5px solid var(--border)",
                        background: picked.includes(n) ? "#DDEBE2" : prize ? "#F5E7C2" : s ? "#FFF" : "var(--open)",
                        cursor: open ? "pointer" : "default", color: "var(--ink)",
                      }}
                    >
                      <div className="display" style={{ fontSize: 16, fontWeight: 600, color: s ? "var(--fairway)" : "var(--muted)" }}>{n}</div>
                      {s ? <div style={{ fontSize: 11.5, fontWeight: 700, marginTop: 2, overflowWrap: "anywhere" }}>{s.name}</div> : <div style={{ fontSize: 11, fontStyle: "italic", color: "var(--muted)", marginTop: 2 }}>{drawn ? "" : picked.includes(n) ? "Selected" : "Open"}</div>}
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
              {drawn && !board.giftCardsIssuedAt && restIndex !== -1 && (
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

            {pendingVenmo.length > 0 && (
              <div style={{ background: "#FBF3DE", borderRadius: 10, padding: 12, marginBottom: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Venmo payments to confirm</div>
                {pendingVenmo.map((g) => (
                  <div key={g.groupId} style={{ padding: "8px 0", borderTop: "1px solid rgba(0,0,0,0.08)" }}>
                    <div style={{ fontSize: 13 }}><strong>{g.name}</strong> · space{g.numbers.length === 1 ? "" : "s"} {[...g.numbers].sort((a, b) => a - b).join(", ")} · <strong>{dollars(g.amountCents)}</strong></div>
                    <div style={{ fontSize: 12, color: "var(--muted)", overflowWrap: "anywhere" }}>{g.email}{g.phone ? ` · ${g.phone}` : ""}</div>
                    <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                      <button disabled={adminBusy} onClick={() => admin("confirmvenmo", { groupId: g.groupId })} style={{ background: "var(--fairway)", color: "var(--chalk)", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 12.5, fontWeight: 700 }}>Mark paid</button>
                      <button disabled={adminBusy} onClick={() => { if (window.confirm(`Release ${g.name}'s spaces? Use this if the Venmo never arrived.`)) admin("releasevenmo", { groupId: g.groupId }); }} style={{ background: "none", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 14px", fontSize: 12.5, fontWeight: 600 }}>Release</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {spaces.length > 0 && (
              <div style={{ fontSize: 12.5 }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Claimed spaces</div>
                {spaces.map((s) => (
                  <div key={s.number} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "5px 0", borderTop: "1px solid var(--border)", alignItems: "center" }}>
                    <span style={{ minWidth: 0, overflowWrap: "anywhere" }}><strong>#{s.number}</strong> {s.name}{s.held ? " (waiting on payment)" : ""} · {s.email}{s.phone ? ` · ${s.phone}` : ""}</span>
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

      {picked.length > 0 && !formOpen && board && (
        <div style={{ position: "fixed", left: 12, right: 12, bottom: "calc(12px + env(safe-area-inset-bottom, 0px))", zIndex: 10000, background: "var(--fairway)", color: "var(--chalk)", borderRadius: 14, padding: "12px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, boxShadow: "0 6px 24px rgba(0,0,0,0.25)", maxWidth: 520, margin: "0 auto" }}>
          <div style={{ fontSize: 13.5, fontWeight: 700 }}>
            {picked.length} space{picked.length === 1 ? "" : "s"} selected{!owner && board.priceCents > 0 ? ` · ${dollars(board.priceCents * picked.length)}` : ""}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setPicked([])} style={{ background: "none", border: "1px solid rgba(255,255,255,0.5)", color: "var(--chalk)", borderRadius: 8, padding: "8px 12px", fontSize: 13, fontWeight: 600 }}>Clear</button>
            <button onClick={() => { setFormOpen(true); setError(null); }} style={{ background: "var(--gold)", color: "#2A2107", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 700 }}>Continue</button>
          </div>
        </div>
      )}

      {formOpen && picked.length > 0 && board && (
        <div onClick={() => setFormOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", overflowY: "auto", WebkitOverflowScrolling: "touch", zIndex: 10001 }}>
          {/* Sits at the top of the screen (not the bottom) so neither the tab bar nor the phone keyboard can cover the fields; scrolls if the screen is short. */}
          <div onClick={(e) => e.stopPropagation()} style={{ width: "calc(100% - 32px)", maxWidth: 480, background: "#FFF", borderRadius: 18, padding: "20px 20px 24px", margin: "16px auto 40vh" }}>
            <div className="display" style={{ fontSize: 20, marginBottom: 4 }}>
              Claim space{picked.length === 1 ? "" : "s"} {[...picked].sort((a, b) => a - b).join(", ")}
            </div>
            {!owner && board.priceCents > 0 && (
              <>
                <p style={{ fontSize: 14, fontWeight: 700, color: "var(--fairway)", margin: "0 0 10px" }}>
                  {picked.length} × {dollars(board.priceCents)} = {dollars(board.priceCents * picked.length)}
                </p>
                <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                  {([["card", "Pay by card"], ...(venmoAvailable ? [["venmo", "Pay with Venmo"]] : [])] as [string, string][]).map(([m, label]) => (
                    <button key={m} onClick={() => setMethod(m as "card" | "venmo")} style={{
                      flex: 1, padding: "10px 8px", borderRadius: 8, fontSize: 13.5, fontWeight: 700, cursor: "pointer",
                      border: method === m ? "2px solid var(--fairway)" : "1px solid var(--border)",
                      background: method === m ? "#DDEBE2" : "#FFF", color: "var(--ink)",
                    }}>{label}</button>
                  ))}
                </div>
                <p style={{ fontSize: 12.5, color: "var(--muted)", margin: "0 0 12px" }}>
                  {method === "venmo"
                    ? "Your spaces are reserved for 24 hours. Send the Venmo payment on the next screen and they're confirmed once it's received."
                    : "Pay by card on the next screen. Your spaces are held for 30 minutes while you pay."}
                </p>
              </>
            )}
            <p style={{ fontSize: 12.5, color: "var(--muted)", margin: "0 0 14px" }}>We use your email to count your spaces (limit {board.maxPerPerson}) and to send your prize or gift card. Other people only see your first name and last initial.</p>
            <input id="raffle-name" onFocus={(e) => setTimeout(() => e.target.scrollIntoView({ block: "center", behavior: "smooth" }), 300)} style={input} placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
            <input id="raffle-email" onFocus={(e) => setTimeout(() => e.target.scrollIntoView({ block: "center", behavior: "smooth" }), 300)} style={input} placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            <input id="raffle-phone" onFocus={(e) => setTimeout(() => e.target.scrollIntoView({ block: "center", behavior: "smooth" }), 300)} style={input} placeholder="Phone (optional)" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
            {error && <p style={{ fontSize: 13, color: "#B23A3A", margin: "0 0 10px" }}>{error}</p>}
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setFormOpen(false)} style={{ flex: 1, background: "none", border: "1px solid var(--border)", borderRadius: 8, padding: 12, fontSize: 14, fontWeight: 600 }}>Back</button>
              <button onClick={claim} disabled={saving || !name.trim() || !email.trim()} style={{ flex: 2, background: "var(--fairway)", color: "var(--chalk)", border: "none", borderRadius: 8, padding: 12, fontSize: 14, fontWeight: 700, opacity: saving ? 0.7 : 1 }}>
                {saving ? "One moment…" : owner || !board.priceCents ? `Claim ${picked.length} space${picked.length === 1 ? "" : "s"}` : method === "venmo" ? `Reserve & pay ${dollars(board.priceCents * picked.length)} with Venmo` : `Pay ${dollars(board.priceCents * picked.length)} by card`}
              </button>
            </div>
          </div>
        </div>
      )}

      {venmoInfo && (
        <div onClick={() => setVenmoInfo(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", overflowY: "auto", zIndex: 10001 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "calc(100% - 32px)", maxWidth: 480, background: "#FFF", borderRadius: 18, padding: "20px 20px 24px", margin: "16px auto" }}>
            <div className="display" style={{ fontSize: 20, marginBottom: 6 }}>Spaces reserved</div>
            <p style={{ fontSize: 14, margin: "0 0 12px" }}>
              Space{venmoInfo.numbers.length === 1 ? "" : "s"} <strong>{venmoInfo.numbers.join(", ")}</strong> {venmoInfo.numbers.length === 1 ? "is" : "are"} yours for 24 hours. Send <strong>{dollars(venmoInfo.amountCents)}</strong> to <strong>@{venmoInfo.handle}</strong> on Venmo to lock {venmoInfo.numbers.length === 1 ? "it" : "them"} in.
            </p>
            <a href={venmoInfo.url} target="_blank" rel="noopener noreferrer" style={{ display: "block", textAlign: "center", background: "#3D95CE", color: "#FFF", borderRadius: 10, padding: 14, fontSize: 15, fontWeight: 700, textDecoration: "none", marginBottom: 10 }}>
              Open Venmo and pay {dollars(venmoInfo.amountCents)}
            </a>
            <p style={{ fontSize: 12.5, color: "var(--muted)", margin: "0 0 12px" }}>
              Keep the note ("{venmoInfo.note}") so we can match your payment. We'll mark your spaces paid as soon as we see it.
            </p>
            <button onClick={() => setVenmoInfo(null)} style={{ width: "100%", background: "none", border: "1px solid var(--border)", borderRadius: 8, padding: 12, fontSize: 14, fontWeight: 600 }}>Done</button>
          </div>
        </div>
      )}
    </div>
  );
}
