"use client";

import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import { Capacitor } from "@capacitor/core";

type OwnGiftCard = { id: string; code: string; initialValueCents: number; remainingValueCents: number; status: string; recipientName: string | null };

const PRESET_AMOUNTS = [2500, 5000, 10000, 20000];

function dollars(cents: number) {
  return `$${(cents / 100).toFixed(0)}`;
}

export default function GiftCardsClient({ slug, basePath, apiBase, businessName, isOwner = false }: { slug: string; basePath: string; apiBase: string; businessName: string; isOwner?: boolean }) {
  const [issueAmount, setIssueAmount] = useState("75");
  const [issueList, setIssueList] = useState("");
  const [issueMessage, setIssueMessage] = useState("");
  const [issueEmail, setIssueEmail] = useState(true);
  const [issuing, setIssuing] = useState(false);
  const [issueError, setIssueError] = useState<string | null>(null);
  const [issueResult, setIssueResult] = useState<{ created: { name: string; email: string; code: string; emailed: boolean }[]; skipped: { name: string; email: string; reason: string }[] } | null>(null);

  async function issueCards() {
    setIssuing(true);
    setIssueError(null);
    setIssueResult(null);
    const recipients = issueList.split(/\n+/).map((l) => l.trim()).filter(Boolean).map((l) => {
      const em = l.match(/[^\s,;<>]+@[^\s,;<>]+/);
      const email = em ? em[0] : "";
      const name = l.replace(email, "").replace(/[,;<>]/g, " ").replace(/\s+/g, " ").trim();
      return { name, email };
    });
    const res = await fetch(`${apiBase}/gift-cards/issue`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amountCents: Math.round(Number(issueAmount) * 100), recipients, message: issueMessage, sendEmail: issueEmail }),
    });
    const data = await res.json().catch(() => ({}));
    setIssuing(false);
    if (!res.ok) { setIssueError(data.error || "Something went wrong."); return; }
    setIssueResult(data);
    setIssueList("");
    fetch(`${apiBase}/gift-cards`).then((r) => r.json()).then((list) => setOwnCards(Array.isArray(list) ? list : [])).catch(() => {});
  }

  const [amountCents, setAmountCents] = useState(5000);
  // Checking Capacitor.isNativePlatform() directly during render caused a
  // hydration mismatch elsewhere tonight (the server always renders as if
  // it's not native, since it has no way to know) - starting this state
  // at false to match the server, and only updating it after mounting on
  // the client, avoids that entirely.
  const [isNative, setIsNative] = useState(false);
  useEffect(() => {
    setIsNative(Capacitor.isNativePlatform());
  }, []);
  const [customAmount, setCustomAmount] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [message, setMessage] = useState("");
  const [purchasing, setPurchasing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ownCards, setOwnCards] = useState<OwnGiftCard[]>([]);

  useEffect(() => {
    fetch(`${apiBase}/gift-cards`).then((r) => r.json()).then((list) => setOwnCards(Array.isArray(list) ? list : [])).catch(() => {});
  }, [apiBase]);

  async function purchase() {
    setPurchasing(true);
    setError(null);
    const res = await fetch(`${apiBase}/gift-cards`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amountCents, recipientName, recipientEmail, message }),
    });
    const data = await res.json();
    setPurchasing(false);
    if (!res.ok) { setError(data.error || "Something went wrong."); return; }
    window.location.href = data.checkoutUrl;
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--chalk)" }}>
      <header style={{ background: "var(--fairway)", color: "var(--chalk)", padding: "24px 20px" }}>
        <div style={{ maxWidth: 640, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span className="display" style={{ fontSize: 18, fontWeight: 700 }}>{businessName}</span>
            <div style={{ display: "flex", gap: 10 }}>
              <a href={`${basePath}/shop`} style={{ fontSize: 13, color: "#D7DED9", textDecoration: "none" }}>Shop</a>
              {!isNative && (
                <a href={`${basePath}/book`} style={{ fontSize: 13, color: "#D7DED9", textDecoration: "none" }}>Book</a>
              )}
              <button onClick={() => signOut({ callbackUrl: "/login" })} style={{ background: "none", border: "none", color: "#D7DED9", fontSize: 13 }}>Sign out</button>
            </div>
          </div>
          <h1 className="display" style={{ fontSize: 24, margin: 0 }}>Gift Cards</h1>
        </div>
      </header>

      <main style={{ maxWidth: 640, margin: "0 auto", padding: "22px 20px 60px" }}>
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: 18, marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Choose an amount</div>
          <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
            {PRESET_AMOUNTS.map((amt) => (
              <button
                key={amt}
                onClick={() => { setAmountCents(amt); setCustomAmount(""); }}
                style={{
                  padding: "10px 16px", borderRadius: 8, fontSize: 14, fontWeight: 700,
                  border: amountCents === amt && !customAmount ? "1px solid var(--fairway)" : "1px solid var(--border)",
                  background: amountCents === amt && !customAmount ? "var(--open)" : "#FFF",
                }}
              >
                {dollars(amt)}
              </button>
            ))}
          </div>
          <input
            value={customAmount}
            onChange={(e) => { setCustomAmount(e.target.value); const n = Number(e.target.value); if (Number.isFinite(n) && n > 0) setAmountCents(Math.round(n * 100)); }}
            placeholder="Or enter a custom amount"
            style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 8, padding: "9px 12px", fontSize: 13, marginBottom: 14 }}
          />

          <input value={recipientName} onChange={(e) => setRecipientName(e.target.value)} placeholder="Recipient name (optional — leave blank if it's for you)"
            style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 8, padding: "9px 12px", fontSize: 13, marginBottom: 8 }} />
          <input value={recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)} placeholder="Recipient email (optional — sends the code straight to them)"
            style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 8, padding: "9px 12px", fontSize: 13, marginBottom: 8 }} />
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="A message (optional)" rows={2}
            style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 8, padding: "9px 12px", fontSize: 13, marginBottom: 14, resize: "vertical" }} />

          {error && <p style={{ fontSize: 12, color: "#B23A3A", margin: "0 0 10px" }}>{error}</p>}

          <button
            onClick={purchase}
            disabled={purchasing || amountCents < 1000}
            style={{ width: "100%", background: "var(--fairway)", color: "var(--chalk)", border: "none", borderRadius: 8, padding: "12px", fontSize: 14, fontWeight: 700, opacity: purchasing ? 0.7 : 1 }}
          >
            {purchasing ? "Starting checkout…" : `Buy a ${dollars(amountCents)} gift card`}
          </button>
        </div>

        {isOwner && (
          <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: 18, marginBottom: 24 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Give out free gift cards</div>
            <p style={{ fontSize: 12, color: "var(--faint)", margin: "0 0 12px" }}>
              For raffle prizes or thank-yous. Paste one person per line as <em>Name, email</em>. Each gets a gift card in their own Gift Cards section, and can be emailed their code.
            </p>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
              <label htmlFor="issue-amount" style={{ fontSize: 12, color: "var(--faint)" }}>Amount $</label>
              <input id="issue-amount" value={issueAmount} onChange={(e) => setIssueAmount(e.target.value)} inputMode="decimal"
                style={{ width: 90, border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px", fontSize: 14 }} />
            </div>
            <textarea value={issueList} onChange={(e) => setIssueList(e.target.value)} rows={5} placeholder={"Jane Smith, jane@email.com\nBob Jones, bob@email.com"}
              style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 8, padding: "9px 12px", fontSize: 13, marginBottom: 8, resize: "vertical" }} />
            <input value={issueMessage} onChange={(e) => setIssueMessage(e.target.value)} placeholder="A message (optional), e.g. Thanks for playing our raffle!"
              style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 8, padding: "9px 12px", fontSize: 13, marginBottom: 8 }} />
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, marginBottom: 12 }}>
              <input type="checkbox" checked={issueEmail} onChange={(e) => setIssueEmail(e.target.checked)} /> Email each person their code
            </label>
            {issueError && <p style={{ fontSize: 12, color: "#B23A3A", margin: "0 0 10px" }}>{issueError}</p>}
            <button
              onClick={() => { if (window.confirm(`Create a $${Number(issueAmount || 0).toFixed(0)} gift card for each person listed?`)) issueCards(); }}
              disabled={issuing || !issueList.trim() || !(Number(issueAmount) >= 1)}
              style={{ width: "100%", background: "var(--fairway)", color: "var(--chalk)", border: "none", borderRadius: 8, padding: "12px", fontSize: 14, fontWeight: 700, opacity: issuing ? 0.7 : 1 }}
            >
              {issuing ? "Creating…" : "Create gift cards"}
            </button>
            {issueResult && (
              <div style={{ marginTop: 14, fontSize: 12.5 }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Created {issueResult.created.length} gift card{issueResult.created.length === 1 ? "" : "s"}.</div>
                {issueResult.created.map((c) => (
                  <div key={c.code} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "3px 0", borderTop: "1px solid var(--border)" }}>
                    <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{c.name || c.email}{c.emailed ? " · emailed" : ""}</span>
                    <span className="mono" style={{ fontWeight: 700 }}>{c.code}</span>
                  </div>
                ))}
                {issueResult.skipped.length > 0 && (
                  <div style={{ marginTop: 8, color: "#B23A3A" }}>
                    Skipped: {issueResult.skipped.map((s) => `${s.name || s.email || "(blank)"} (${s.reason})`).join("; ")}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {ownCards.length > 0 && (
          <>
            <div className="mono" style={{ fontSize: 11, color: "var(--faint)", marginBottom: 8, letterSpacing: "0.04em" }}>YOUR GIFT CARDS</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {ownCards.map((c) => (
                <div key={c.id} style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div className="mono" style={{ fontSize: 13, fontWeight: 700 }}>{c.code}</div>
                    {c.recipientName && <div style={{ fontSize: 11, color: "var(--faint)" }}>for {c.recipientName}</div>}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--fairway)" }}>
                    {dollars(c.remainingValueCents)} <span style={{ fontWeight: 400, color: "var(--faint)" }}>of {dollars(c.initialValueCents)}</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
