"use client";

import { useEffect, useState } from "react";
import type { CSSProperties } from "react";

type Variant = { id: string; label: string; stockQuantity: number };
type Product = {
  id: string; name: string; description: string | null; category: string | null;
  imageUrl: string | null; priceCents: number; stockQuantity: number | null; enabled: boolean; variants: Variant[];
};
type OrderItem = { id: string; quantity: number; priceCentsAtPurchase: number; product: { name: string }; variant: { label: string } | null };
type Order = {
  id: string; status: string; fulfillmentType: string; shippingName: string | null; shippingAddress: string | null;
  contactPhone: string | null; contactEmail: string | null; totalCents: number; giftCardAppliedCents: number;
  createdAt: string; items: OrderItem[]; buyer: { name: string | null; email: string };
};

function dollars(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function InstructorShopClient({ slug, basePath, apiBase }: { slug: string; basePath: string; apiBase: string }) {
  const [tab, setTab] = useState<"products" | "orders">("products");
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [price, setPrice] = useState("");
  const [stockQuantity, setStockQuantity] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [variantRows, setVariantRows] = useState<{ label: string; stockQuantity: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function load() {
    fetch(`${apiBase}/products`).then((r) => r.json()).then((list) => setProducts(Array.isArray(list) ? list : []));
    fetch(`${apiBase}/orders`).then((r) => r.json()).then((list) => setOrders(Array.isArray(list) ? list : []));
    setLoading(false);
  }
  useEffect(() => { load(); }, [apiBase]);

  function resetForm() {
    setEditingId(null); setName(""); setDescription(""); setCategory(""); setPrice("");
    setStockQuantity(""); setImageFile(null); setVariantRows([]); setFormError(null); setFormOpen(false);
  }

  function startEdit(p: Product) {
    setEditingId(p.id);
    setName(p.name); setDescription(p.description || ""); setCategory(p.category || "");
    setPrice((p.priceCents / 100).toString());
    setStockQuantity(p.stockQuantity !== null ? String(p.stockQuantity) : "");
    setVariantRows(p.variants.map((v) => ({ label: v.label, stockQuantity: String(v.stockQuantity) })));
    setFormOpen(true);
  }

  async function saveProduct() {
    if (!name.trim()) { setFormError("Give the product a name."); return; }
    const priceNum = Number(price);
    if (!Number.isFinite(priceNum) || priceNum < 0) { setFormError("Enter a valid price."); return; }

    setSaving(true);
    setFormError(null);
    const form = new FormData();
    form.append("name", name.trim());
    form.append("description", description.trim());
    form.append("category", category.trim());
    form.append("priceCents", String(Math.round(priceNum * 100)));
    if (variantRows.length === 0 && stockQuantity) form.append("stockQuantity", stockQuantity);
    if (variantRows.length > 0) {
      form.append("variantsJson", JSON.stringify(variantRows.filter((v) => v.label.trim()).map((v) => ({ label: v.label.trim(), stockQuantity: Number(v.stockQuantity) || 0 }))));
    }
    if (imageFile) form.append("image", imageFile);

    const res = await fetch(editingId ? `${apiBase}/products/${editingId}` : `${apiBase}/products`, {
      method: editingId ? "PATCH" : "POST",
      body: form,
    });
    setSaving(false);
    if (!res.ok) { const data = await res.json().catch(() => ({})); setFormError(data.error || "Something went wrong."); return; }
    resetForm();
    load();
  }

  async function toggleEnabled(p: Product) {
    const form = new FormData();
    form.append("enabled", String(!p.enabled));
    await fetch(`${apiBase}/products/${p.id}`, { method: "PATCH", body: form });
    load();
  }

  async function deleteProduct(id: string) {
    await fetch(`${apiBase}/products/${id}`, { method: "DELETE" });
    load();
  }

  async function updateOrderStatus(id: string, status: "fulfilled" | "cancelled") {
    await fetch(`${apiBase}/orders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    load();
  }

  const pendingOrders = orders.filter((o) => o.status === "paid");
  const otherOrders = orders.filter((o) => o.status !== "paid");

  return (
    <div style={{ minHeight: "100vh", background: "var(--fairway)" }}>
      <header style={{ padding: "24px 20px", color: "var(--chalk)" }}>
        <div style={{ maxWidth: 800, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span className="display" style={{ fontSize: 18, fontWeight: 700 }}>Shop</span>
            <a href={`${basePath}/instructor`} style={{ fontSize: 13, color: "#D7DED9", textDecoration: "none" }}>← Back to dashboard</a>
          </div>
          <h1 className="display" style={{ fontSize: 24, margin: "0 0 14px" }}>Manage your shop</h1>
          <div style={{ display: "flex", gap: 6 }}>
            {(["products", "orders"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  padding: "8px 16px", borderRadius: 7, border: "none", fontSize: 13, fontWeight: 600,
                  background: tab === t ? "#F6F4EE" : "transparent", color: tab === t ? "#1B3A2F" : "#D7DED9",
                }}
              >
                {t === "products" ? "Products" : `Orders${pendingOrders.length > 0 ? ` (${pendingOrders.length})` : ""}`}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 800, margin: "0 auto", padding: "20px 20px 60px", background: "var(--chalk)", borderRadius: "16px 16px 0 0", minHeight: "60vh" }}>
        {loading ? (
          <p style={{ fontSize: 13, color: "var(--faint)" }}>Loading…</p>
        ) : tab === "products" ? (
          <>
            {!formOpen ? (
              <button onClick={() => setFormOpen(true)} style={{ background: "var(--fairway)", color: "var(--chalk)", border: "none", borderRadius: 8, padding: "10px 18px", fontSize: 13, fontWeight: 700, marginBottom: 20 }}>
                + Add product
              </button>
            ) : (
              <div style={{ background: "#FFF", border: "1px solid var(--border)", borderRadius: 12, padding: 16, marginBottom: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>{editingId ? "Edit product" : "New product"}</div>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Product name" style={inputStyle} />
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description (optional)" rows={2} style={{ ...inputStyle, resize: "vertical" }} />
                <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Category (optional) — e.g. Clubs, Apparel" style={inputStyle} />
                <input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Price (e.g. 199.99)" inputMode="decimal" style={inputStyle} />

                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", display: "block", marginBottom: 4 }}>Photo</label>
                <input type="file" accept="image/*" onChange={(e) => setImageFile(e.target.files?.[0] || null)} style={{ marginBottom: 10, fontSize: 12 }} />

                {variantRows.length === 0 ? (
                  <>
                    <input value={stockQuantity} onChange={(e) => setStockQuantity(e.target.value)} placeholder="Stock quantity (leave blank for unlimited)" inputMode="numeric" style={inputStyle} />
                    <button onClick={() => setVariantRows([{ label: "", stockQuantity: "" }])} style={{ fontSize: 12, fontWeight: 700, color: "var(--fairway)", background: "none", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 10px", marginBottom: 10 }}>
                      + Add options (sizes, flex, etc.)
                    </button>
                  </>
                ) : (
                  <div style={{ marginBottom: 10 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", display: "block", marginBottom: 6 }}>Options</label>
                    {variantRows.map((v, i) => (
                      <div key={i} style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                        <input value={v.label} onChange={(e) => setVariantRows((prev) => prev.map((row, ri) => ri === i ? { ...row, label: e.target.value } : row))} placeholder="e.g. Men's L" style={{ ...inputStyle, marginBottom: 0, flex: 2 }} />
                        <input value={v.stockQuantity} onChange={(e) => setVariantRows((prev) => prev.map((row, ri) => ri === i ? { ...row, stockQuantity: e.target.value } : row))} placeholder="Stock" inputMode="numeric" style={{ ...inputStyle, marginBottom: 0, flex: 1 }} />
                        <button onClick={() => setVariantRows((prev) => prev.filter((_, ri) => ri !== i))} style={{ background: "none", border: "1px solid var(--border)", borderRadius: 6, padding: "0 10px", color: "#B23A3A" }}>×</button>
                      </div>
                    ))}
                    <button onClick={() => setVariantRows((prev) => [...prev, { label: "", stockQuantity: "" }])} style={{ fontSize: 12, fontWeight: 700, color: "var(--fairway)", background: "none", border: "none" }}>
                      + Another option
                    </button>
                  </div>
                )}

                {formError && <p style={{ fontSize: 12, color: "#B23A3A", margin: "0 0 10px" }}>{formError}</p>}

                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={resetForm} style={{ flex: 1, background: "none", border: "1px solid var(--border)", borderRadius: 8, padding: "10px", fontSize: 13, fontWeight: 600 }}>Cancel</button>
                  <button onClick={saveProduct} disabled={saving} style={{ flex: 2, background: "var(--fairway)", color: "var(--chalk)", border: "none", borderRadius: 8, padding: "10px", fontSize: 13, fontWeight: 700, opacity: saving ? 0.7 : 1 }}>
                    {saving ? "Saving…" : editingId ? "Save changes" : "Add product"}
                  </button>
                </div>
              </div>
            )}

            {products.length === 0 ? (
              <p style={{ fontSize: 13, color: "var(--faint)" }}>No products yet.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {products.map((p) => (
                  <div key={p.id} style={{ background: "#FFF", border: "1px solid var(--border)", borderRadius: 10, padding: 12, display: "flex", gap: 12, alignItems: "center", opacity: p.enabled ? 1 : 0.55 }}>
                    {p.imageUrl ? (
                      <img src={p.imageUrl} alt="" style={{ width: 48, height: 48, borderRadius: 6, objectFit: "cover", flexShrink: 0 }} />
                    ) : (
                      <div style={{ width: 48, height: 48, borderRadius: 6, background: "var(--closed)", flexShrink: 0 }} />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{p.name}{!p.enabled && " (hidden)"}</div>
                      <div className="mono" style={{ fontSize: 11, color: "var(--faint)" }}>
                        {dollars(p.priceCents)} {p.variants.length > 0 ? `· ${p.variants.length} option${p.variants.length !== 1 ? "s" : ""}` : p.stockQuantity !== null ? `· ${p.stockQuantity} in stock` : ""}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      <button onClick={() => startEdit(p)} style={{ fontSize: 11, fontWeight: 700, background: "none", border: "1px solid var(--border)", borderRadius: 6, padding: "5px 9px" }}>Edit</button>
                      <button onClick={() => toggleEnabled(p)} style={{ fontSize: 11, fontWeight: 700, background: "none", border: "1px solid var(--border)", borderRadius: 6, padding: "5px 9px" }}>{p.enabled ? "Hide" : "Show"}</button>
                      <button onClick={() => deleteProduct(p.id)} style={{ fontSize: 11, fontWeight: 700, color: "#B23A3A", background: "none", border: "1px solid var(--border)", borderRadius: 6, padding: "5px 9px" }}>Remove</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            {pendingOrders.length > 0 && (
              <>
                <div className="mono" style={{ fontSize: 11, color: "var(--faint)", marginBottom: 8, letterSpacing: "0.04em" }}>NEEDS FULFILLMENT</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
                  {pendingOrders.map((o) => <OrderCard key={o.id} order={o} onUpdate={updateOrderStatus} />)}
                </div>
              </>
            )}
            <div className="mono" style={{ fontSize: 11, color: "var(--faint)", marginBottom: 8, letterSpacing: "0.04em" }}>ALL ORDERS</div>
            {otherOrders.length === 0 && pendingOrders.length === 0 ? (
              <p style={{ fontSize: 13, color: "var(--faint)" }}>No orders yet.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {otherOrders.map((o) => <OrderCard key={o.id} order={o} onUpdate={updateOrderStatus} />)}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

const inputStyle: CSSProperties = { width: "100%", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px", fontFamily: "inherit", fontSize: 13, marginBottom: 8 };

function OrderCard({ order, onUpdate }: { order: Order; onUpdate: (id: string, status: "fulfilled" | "cancelled") => void }) {
  const statusColors: Record<string, { bg: string; fg: string }> = {
    pending: { bg: "#FBF3DE", fg: "#9A7A1E" },
    paid: { bg: "#F0DDA6", fg: "#7A5A1E" },
    fulfilled: { bg: "#E7F0EA", fg: "#1B3A2F" },
    cancelled: { bg: "#F5E5E5", fg: "#B23A3A" },
  };
  const c = statusColors[order.status] || statusColors.pending;

  return (
    <div style={{ background: "#FFF", border: "1px solid var(--border)", borderRadius: 10, padding: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700 }}>{order.buyer.name || order.buyer.email}</div>
          <div className="mono" style={{ fontSize: 11, color: "var(--faint)" }}>{new Date(order.createdAt).toLocaleDateString()} · {order.fulfillmentType === "pickup" ? "Pickup" : "Ship"}</div>
        </div>
        <span className="mono" style={{ fontSize: 10, fontWeight: 700, background: c.bg, color: c.fg, borderRadius: 4, padding: "3px 7px" }}>{order.status.toUpperCase()}</span>
      </div>

      <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 8 }}>
        {order.items.map((it) => `${it.quantity}× ${it.product.name}${it.variant ? ` (${it.variant.label})` : ""}`).join(", ")}
      </div>

      {order.fulfillmentType === "shipping" && order.shippingAddress && (
        <div style={{ fontSize: 12, color: "var(--faint)", marginBottom: 8 }}>{order.shippingName} — {order.shippingAddress}</div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>
          {dollars(order.totalCents)}
          {order.giftCardAppliedCents > 0 && <span style={{ fontWeight: 400, color: "var(--faint)", fontSize: 11 }}> ({dollars(order.giftCardAppliedCents)} gift card)</span>}
        </div>
        {order.status === "paid" && (
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => onUpdate(order.id, "cancelled")} style={{ fontSize: 11, fontWeight: 700, color: "#B23A3A", background: "none", border: "1px solid var(--border)", borderRadius: 6, padding: "5px 9px" }}>Cancel</button>
            <button onClick={() => onUpdate(order.id, "fulfilled")} style={{ fontSize: 11, fontWeight: 700, background: "var(--fairway)", color: "var(--chalk)", border: "none", borderRadius: 6, padding: "5px 9px" }}>Mark fulfilled</button>
          </div>
        )}
      </div>
    </div>
  );
}
