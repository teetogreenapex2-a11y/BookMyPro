"use client";

import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";

type Variant = { id: string; label: string; stockQuantity: number };
type Product = {
  id: string; name: string; description: string | null; category: string | null;
  imageUrl: string | null; priceCents: number; stockQuantity: number | null; variants: Variant[];
};
type CartLine = { productId: string; variantId: string | null; name: string; variantLabel: string | null; priceCents: number; quantity: number };

function dollars(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function ShopClient({ slug, basePath, apiBase, businessName }: { slug: string; basePath: string; apiBase: string; businessName: string }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [selectedVariant, setSelectedVariant] = useState<Record<string, string>>({});
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [fulfillmentType, setFulfillmentType] = useState<"pickup" | "shipping">("pickup");
  const [shippingName, setShippingName] = useState("");
  const [shippingAddress, setShippingAddress] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [giftCardCode, setGiftCardCode] = useState("");
  const [giftCardBalance, setGiftCardBalance] = useState<number | null>(null);
  const [giftCardError, setGiftCardError] = useState<string | null>(null);
  const [checkingGiftCard, setCheckingGiftCard] = useState(false);
  const [placingOrder, setPlacingOrder] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${apiBase}/products`).then((r) => r.json()).then((list) => {
      setProducts(Array.isArray(list) ? list : []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [apiBase]);

  function addToCart(product: Product) {
    const variantId = selectedVariant[product.id] || null;
    const variant = product.variants.find((v) => v.id === variantId) || null;
    if (product.variants.length > 0 && !variant) return;

    setCart((prev) => {
      const existing = prev.find((l) => l.productId === product.id && l.variantId === variantId);
      if (existing) {
        return prev.map((l) => (l === existing ? { ...l, quantity: l.quantity + 1 } : l));
      }
      return [...prev, {
        productId: product.id, variantId, name: product.name,
        variantLabel: variant?.label || null, priceCents: product.priceCents, quantity: 1,
      }];
    });
  }

  function updateQuantity(index: number, delta: number) {
    setCart((prev) => prev
      .map((l, i) => (i === index ? { ...l, quantity: l.quantity + delta } : l))
      .filter((l) => l.quantity > 0));
  }

  const cartTotal = cart.reduce((sum, l) => sum + l.priceCents * l.quantity, 0);
  const giftCardApplied = giftCardBalance !== null ? Math.min(giftCardBalance, cartTotal) : 0;
  const amountDue = cartTotal - giftCardApplied;

  async function checkGiftCard() {
    if (!giftCardCode.trim()) return;
    setCheckingGiftCard(true);
    setGiftCardError(null);
    const res = await fetch(`${apiBase}/gift-cards/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: giftCardCode }),
    });
    setCheckingGiftCard(false);
    const data = await res.json();
    if (res.ok) setGiftCardBalance(data.remainingValueCents);
    else { setGiftCardError(data.error); setGiftCardBalance(null); }
  }

  async function placeOrder() {
    if (cart.length === 0) return;
    if (fulfillmentType === "shipping" && (!shippingName.trim() || !shippingAddress.trim())) {
      setOrderError("Enter a shipping name and address.");
      return;
    }
    setPlacingOrder(true);
    setOrderError(null);
    const res = await fetch(`${apiBase}/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: cart.map((l) => ({ productId: l.productId, variantId: l.variantId, quantity: l.quantity })),
        fulfillmentType, shippingName, shippingAddress, contactPhone, contactEmail,
        giftCardCode: giftCardBalance !== null ? giftCardCode : undefined,
      }),
    });
    const data = await res.json();
    setPlacingOrder(false);
    if (!res.ok) { setOrderError(data.error || "Something went wrong."); return; }
    if (data.checkoutUrl) window.location.href = data.checkoutUrl;
    else window.location.href = `${basePath}/shop?purchase=success`;
  }

  return (
    <div style={{ minHeight: "100vh" }}>
      <header style={{ background: "var(--fairway)", color: "var(--chalk)", padding: "24px 20px" }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span className="display" style={{ fontSize: 18, fontWeight: 700 }}>{businessName}</span>
            <div style={{ display: "flex", gap: 10 }}>
              <a href={`${basePath}/gift-cards`} style={{ fontSize: 13, color: "#D7DED9", textDecoration: "none" }}>Gift Cards</a>
              <a href={`${basePath}/book`} style={{ fontSize: 13, color: "#D7DED9", textDecoration: "none" }}>Book</a>
              <button onClick={() => signOut({ callbackUrl: "/login" })} style={{ background: "none", border: "none", color: "#D7DED9", fontSize: 13 }}>Sign out</button>
            </div>
          </div>
          <h1 className="display" style={{ fontSize: 24, margin: 0 }}>Shop</h1>
        </div>
      </header>

      <main style={{ maxWidth: 720, margin: "0 auto", padding: "22px 20px 100px" }}>
        {loading ? (
          <p style={{ fontSize: 13, color: "var(--faint)" }}>Loading…</p>
        ) : products.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--faint)" }}>Nothing in the shop yet — check back soon.</p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            {products.map((p) => (
              <div key={p.id} style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: 14, display: "flex", flexDirection: "column" }}>
                {p.imageUrl ? (
                  <img src={p.imageUrl} alt={p.name} style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: 8, marginBottom: 10 }} />
                ) : (
                  <div style={{ width: "100%", aspectRatio: "1", background: "var(--closed)", borderRadius: 8, marginBottom: 10 }} />
                )}
                <div style={{ fontSize: 13, fontWeight: 700 }}>{p.name}</div>
                {p.category && <div className="mono" style={{ fontSize: 10, color: "var(--faint)", marginBottom: 4 }}>{p.category}</div>}
                <div style={{ fontSize: 15, fontWeight: 700, color: "var(--fairway)", margin: "4px 0 8px" }}>{dollars(p.priceCents)}</div>

                {p.variants.length > 0 && (
                  <select
                    value={selectedVariant[p.id] || ""}
                    onChange={(e) => setSelectedVariant((prev) => ({ ...prev, [p.id]: e.target.value }))}
                    style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 8px", fontSize: 12, marginBottom: 8 }}
                  >
                    <option value="">Choose an option…</option>
                    {p.variants.map((v) => (
                      <option key={v.id} value={v.id} disabled={v.stockQuantity <= 0}>
                        {v.label} {v.stockQuantity <= 0 ? "(out of stock)" : ""}
                      </option>
                    ))}
                  </select>
                )}

                <button
                  onClick={() => addToCart(p)}
                  disabled={(p.variants.length > 0 && !selectedVariant[p.id]) || (p.variants.length === 0 && p.stockQuantity === 0)}
                  style={{
                    marginTop: "auto", background: "var(--fairway)", color: "var(--chalk)", border: "none",
                    borderRadius: 8, padding: "8px 12px", fontSize: 12, fontWeight: 700,
                    opacity: (p.variants.length > 0 && !selectedVariant[p.id]) || (p.variants.length === 0 && p.stockQuantity === 0) ? 0.5 : 1,
                  }}
                >
                  {p.variants.length === 0 && p.stockQuantity === 0 ? "Out of stock" : "Add to cart"}
                </button>
              </div>
            ))}
          </div>
        )}
      </main>

      {cart.length > 0 && (
        <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "#FFF", borderTop: "1px solid var(--border)", padding: "14px 20px", boxShadow: "0 -4px 16px rgba(0,0,0,0.08)" }}>
          <div style={{ maxWidth: 720, margin: "0 auto" }}>
            {!checkoutOpen ? (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: 13 }}>
                  <strong>{cart.reduce((n, l) => n + l.quantity, 0)} item{cart.reduce((n, l) => n + l.quantity, 0) !== 1 ? "s" : ""}</strong> · {dollars(cartTotal)}
                </div>
                <button onClick={() => setCheckoutOpen(true)} style={{ background: "var(--fairway)", color: "var(--chalk)", border: "none", borderRadius: 8, padding: "10px 20px", fontSize: 13, fontWeight: 700 }}>
                  Checkout
                </button>
              </div>
            ) : (
              <div style={{ maxHeight: "70vh", overflowY: "auto" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
                  {cart.map((l, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12.5 }}>
                      <span>{l.name}{l.variantLabel ? ` — ${l.variantLabel}` : ""}</span>
                      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <button onClick={() => updateQuantity(i, -1)} style={{ width: 22, height: 22, borderRadius: 4, border: "1px solid var(--border)", background: "#FFF" }}>−</button>
                        {l.quantity}
                        <button onClick={() => updateQuantity(i, 1)} style={{ width: 22, height: 22, borderRadius: 4, border: "1px solid var(--border)", background: "#FFF" }}>+</button>
                        <span style={{ width: 50, textAlign: "right" }}>{dollars(l.priceCents * l.quantity)}</span>
                      </span>
                    </div>
                  ))}
                </div>

                <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                  {(["pickup", "shipping"] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => setFulfillmentType(f)}
                      style={{
                        flex: 1, padding: "8px", borderRadius: 8, fontSize: 12, fontWeight: 700,
                        border: fulfillmentType === f ? "1px solid var(--fairway)" : "1px solid var(--border)",
                        background: fulfillmentType === f ? "var(--open)" : "#FFF",
                      }}
                    >
                      {f === "pickup" ? "Pick up" : "Ship to me"}
                    </button>
                  ))}
                </div>

                {fulfillmentType === "shipping" && (
                  <>
                    <input value={shippingName} onChange={(e) => setShippingName(e.target.value)} placeholder="Full name"
                      style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 10px", fontSize: 13, marginBottom: 6 }} />
                    <textarea value={shippingAddress} onChange={(e) => setShippingAddress(e.target.value)} placeholder="Shipping address" rows={2}
                      style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 10px", fontSize: 13, marginBottom: 6, resize: "vertical" }} />
                  </>
                )}
                <input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="Phone"
                  style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 10px", fontSize: 13, marginBottom: 6 }} />
                <input value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="Email"
                  style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 10px", fontSize: 13, marginBottom: 10 }} />

                <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                  <input
                    value={giftCardCode}
                    onChange={(e) => { setGiftCardCode(e.target.value); setGiftCardBalance(null); }}
                    placeholder="Gift card code (optional)"
                    style={{ flex: 1, border: "1px solid var(--border)", borderRadius: 6, padding: "8px 10px", fontSize: 13 }}
                  />
                  <button onClick={checkGiftCard} disabled={checkingGiftCard || !giftCardCode.trim()} style={{ background: "#FFF", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 12px", fontSize: 12, fontWeight: 700 }}>
                    Apply
                  </button>
                </div>
                {giftCardError && <p style={{ fontSize: 11.5, color: "#B23A3A", margin: "0 0 8px" }}>{giftCardError}</p>}
                {giftCardBalance !== null && (
                  <p style={{ fontSize: 11.5, color: "var(--fairway)", margin: "0 0 8px" }}>
                    Gift card has {dollars(giftCardBalance)} available — {dollars(giftCardApplied)} will be applied.
                  </p>
                )}

                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 700, marginBottom: 10, paddingTop: 8, borderTop: "1px solid var(--border)" }}>
                  <span>Total due</span>
                  <span>{dollars(amountDue)}</span>
                </div>

                {orderError && <p style={{ fontSize: 12, color: "#B23A3A", margin: "0 0 8px" }}>{orderError}</p>}

                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => setCheckoutOpen(false)} style={{ flex: 1, background: "none", border: "1px solid var(--border)", borderRadius: 8, padding: "10px", fontSize: 13, fontWeight: 600 }}>
                    Back
                  </button>
                  <button onClick={placeOrder} disabled={placingOrder} style={{ flex: 2, background: "var(--fairway)", color: "var(--chalk)", border: "none", borderRadius: 8, padding: "10px", fontSize: 13, fontWeight: 700, opacity: placingOrder ? 0.7 : 1 }}>
                    {placingOrder ? "Placing order…" : amountDue <= 0 ? "Complete order" : `Pay ${dollars(amountDue)}`}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
