"use client";

import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";

type OwnGiftCard = { id: string; code: string; initialValueCents: number; remainingValueCents: number; status: string; recipientName: string | null };

const PRESET_AMOUNTS = [2500, 5000, 10000, 20000];

function dollars(cents: number) {
  return `$${(cents / 100).toFixed(0)}`;
}

export default function GiftCardsClient({ slug, basePath, apiBase, businessName }: { slug: string; basePath: string; apiBase: string; businessName: string }) {
  const [amountCents, setAmountCents] = useState(5000);
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
    <div style={{ minHeight: "100vh" }}>
      <header style={{ background: "var(--fairway)", color: "var(--chalk)", padding: "24px 20px" }}>
        <div style={{ maxWidth: 640, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span className="display" style={{ fontSize: 18, fontWeight: 700 }}>{businessName}</span>
            <div style={{ display: "flex", gap: 10 }}>
              <a href={`${basePath}/shop`} style={{ fontSize: 13, color: "#D7DED9", textDecoration: "none" }}>Shop</a>
              <a href={`${basePath}/book`} style={{ fontSize: 13, color: "#D7DED9", textDecoration: "none" }}>Book</a>
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
