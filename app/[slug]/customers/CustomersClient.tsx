"use client";

import { useMemo, useState } from "react";
import "./customers.css";

type Customer = {
  id: string;
  name: string;
  email: string;
  phone: string;
  packages: {
    id: string; type: string; label: string; lessonsTotal: number; lessonsRemaining: number;
    paymentStatus?: string; balanceDueCents?: number; creditCents?: number; canUpgrade?: boolean; upgradeTiers: UpgradeTier[];
  }[];
  fittings: { id: string; label: string; startTime: string }[];
  totalLessonsRemaining: number;
  upcomingLessons: number;
};

type UpgradeTier = { id: string; label: string; lessons: number; priceCents: number };

function centsToDollars(cents: number) {
  return `$${(cents / 100).toFixed(0)}`;
}

export default function CustomersClient({
  customers: initialCustomers, slug, basePath, apiBase,
}: { customers: Customer[]; slug: string; basePath: string; apiBase: string }) {
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "remaining">("name");
  const [customers, setCustomers] = useState(initialCustomers);
  const [markingPaid, setMarkingPaid] = useState<string | null>(null);
  const [editingPackageId, setEditingPackageId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [savingAdjustment, setSavingAdjustment] = useState(false);
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [nameValue, setNameValue] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [upgrading, setUpgrading] = useState<string | null>(null);
  const [openUpgradeFor, setOpenUpgradeFor] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({ name: "", email: "", phone: "" });
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function deleteCustomer(customerId: string, force = false) {
    setDeletingId(customerId);
    const res = await fetch(`${apiBase}/players/${customerId}${force ? "?force=true" : ""}`, { method: "DELETE" });
    const data = await res.json();
    setDeletingId(null);
    if (res.status === 409 && data.warning) {
      const confirmed = window.confirm(data.message + "\n\nDelete anyway?");
      if (confirmed) await deleteCustomer(customerId, true);
      return;
    }
    if (res.ok) {
      setCustomers((prev) => prev.filter((c) => c.id !== customerId));
    } else {
      alert(data.error || "Something went wrong.");
    }
  }

  const [startingConversationId, setStartingConversationId] = useState<string | null>(null);
  async function messageCustomer(playerUserId: string) {
    setStartingConversationId(playerUserId);
    const res = await fetch(`${apiBase}/conversations/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerUserId }),
    });
    setStartingConversationId(null);
    if (res.ok) {
      const { id } = await res.json();
      window.location.href = `${basePath}/instructor/messages/${id}`;
    } else {
      const text = await res.text();
      alert(`Couldn't start the conversation (${res.status}): ${text.slice(0, 300)}`);
    }
  }

  async function addCustomer() {
    if (!addForm.name.trim() || !addForm.email.trim()) {
      setAddError("Name and email are required.");
      return;
    }
    setAdding(true);
    setAddError(null);
    const res = await fetch(`${apiBase}/players/manual`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(addForm),
    });
    const data = await res.json();
    setAdding(false);
    if (res.ok) {
      setCustomers((prev) => [
        ...prev,
        { id: data.id, name: data.name, email: data.email, phone: data.phone, packages: [], fittings: [], totalLessonsRemaining: 0, upcomingLessons: 0 },
      ]);
      setAddForm({ name: "", email: "", phone: "" });
      setAddOpen(false);
    } else {
      setAddError(data.error || "Something went wrong.");
    }
  }

  async function markPaid(packageId: string) {
    setMarkingPaid(packageId);
    const res = await fetch(`${apiBase}/packages/${packageId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentStatus: "paid" }),
    });
    if (res.ok) {
      setCustomers((prev) =>
        prev.map((c) => ({
          ...c,
          packages: c.packages.map((p) => (p.id === packageId ? { ...p, paymentStatus: "paid", balanceDueCents: 0 } : p)),
        }))
      );
    }
    setMarkingPaid(null);
  }

  async function saveName(customerId: string) {
    if (!nameValue.trim()) return;
    setSavingName(true);
    const res = await fetch(`${apiBase}/players/${customerId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: nameValue.trim() }),
    });
    setSavingName(false);
    if (res.ok) {
      setCustomers((prev) => prev.map((c) => (c.id === customerId ? { ...c, name: nameValue.trim() } : c)));
      setEditingNameId(null);
    }
  }

  async function saveAdjustment(packageId: string) {
    const parsed = Number(editValue);
    if (!Number.isInteger(parsed) || parsed < 0) return;
    setSavingAdjustment(true);
    const res = await fetch(`${apiBase}/packages/${packageId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lessonsRemaining: parsed }),
    });
    setSavingAdjustment(false);
    if (res.ok) {
      setCustomers((prev) =>
        prev.map((c) => ({
          ...c,
          packages: c.packages.map((p) => (p.id === packageId ? { ...p, lessonsRemaining: parsed } : p)),
        }))
      );
      setEditingPackageId(null);
    }
  }

  async function upgradePackage(customerId: string, packageId: string, newType: string) {
    setUpgrading(packageId);
    const res = await fetch(`${apiBase}/packages/${packageId}/upgrade`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newType }),
    });
    const data = await res.json();
    if (res.ok) {
      setCustomers((prev) =>
        prev.map((c) => {
          if (c.id !== customerId) return c;
          const oldPkg = c.packages.find((p) => p.id === packageId);
          const updatedOld = c.packages.map((p) => (p.id === packageId ? { ...p, lessonsRemaining: 0, canUpgrade: false } : p));
          return {
            ...c,
            packages: [
              ...updatedOld,
              {
                id: data.id, type: data.type, label: oldPkg?.upgradeTiers.find((t) => t.id === data.type)?.label || data.type,
                lessonsTotal: data.lessonsTotal, lessonsRemaining: data.lessonsRemaining,
                paymentStatus: data.paymentStatus, creditCents: data.creditCents, canUpgrade: false,
                upgradeTiers: [], // this package's own upgrade options aren't known client-side yet — fine, it can't be upgraded again anyway
              },
            ],
            totalLessonsRemaining: c.totalLessonsRemaining + data.lessonsRemaining,
          };
        })
      );
      setOpenUpgradeFor(null);
    } else {
      alert(data.error || "Something went wrong.");
    }
    setUpgrading(null);
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let rows = customers.filter(
      (c) => !q || c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q)
    );
    rows = [...rows].sort((a, b) =>
      sortBy === "name" ? a.name.localeCompare(b.name) : b.totalLessonsRemaining - a.totalLessonsRemaining
    );
    return rows;
  }, [customers, query, sortBy]);

  const totalLessonsOutstanding = useMemo(
    () => customers.reduce((sum, c) => sum + c.totalLessonsRemaining, 0),
    [customers]
  );
  const totalBalanceDueCents = useMemo(
    () => customers.reduce((sum, c) => sum + c.packages.reduce((s, p) => s + (p.balanceDueCents || 0), 0), 0),
    [customers]
  );

  function initials(name: string, email: string) {
    const source = (name || email || "?").trim();
    const parts = source.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return source.slice(0, 2).toUpperCase();
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--chalk)" }}>
      <header style={{ background: "var(--fairway)", color: "var(--chalk)", padding: "28px 20px 24px" }}>
        <div style={{ maxWidth: 960, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
            <div>
              <div className="mono" style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", color: "#9DB8A9", marginBottom: 4 }}>
                CUSTOMER LEDGER
              </div>
              <h1 className="display" style={{ fontSize: 28, margin: 0 }}>Customers</h1>
            </div>
            <a href={`${basePath}/instructor`} style={{ fontSize: 13, color: "#D7DED9", textDecoration: "none", paddingTop: 4 }}>
              ← Back
            </a>
          </div>

          <div style={{ display: "flex", gap: 22, marginBottom: 18, flexWrap: "wrap" }}>
            <div>
              <div className="mono" style={{ fontSize: 20, fontWeight: 700, color: "var(--chalk)" }}>{customers.length}</div>
              <div style={{ fontSize: 11, color: "#9DB8A9", fontWeight: 600 }}>Customers</div>
            </div>
            <div style={{ width: 1, background: "rgba(255,255,255,0.15)" }} />
            <div>
              <div className="mono" style={{ fontSize: 20, fontWeight: 700, color: "var(--chalk)" }}>{totalLessonsOutstanding}</div>
              <div style={{ fontSize: 11, color: "#9DB8A9", fontWeight: 600 }}>Lessons outstanding</div>
            </div>
            {totalBalanceDueCents > 0 && (
              <>
                <div style={{ width: 1, background: "rgba(255,255,255,0.15)" }} />
                <div>
                  <div className="mono" style={{ fontSize: 20, fontWeight: 700, color: "var(--gold)" }}>{centsToDollars(totalBalanceDueCents)}</div>
                  <div style={{ fontSize: 11, color: "#9DB8A9", fontWeight: 600 }}>Balance due</div>
                </div>
              </>
            )}
          </div>

          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or email…"
            className="contact-input"
            style={{
              width: "100%", border: "1px solid rgba(255,255,255,0.18)", borderRadius: 8, padding: "10px 12px",
              fontFamily: "inherit", fontSize: 14, background: "rgba(255,255,255,0.08)", color: "var(--chalk)",
            }}
          />
        </div>
      </header>

      <main style={{ maxWidth: 960, margin: "0 auto", padding: "20px 20px 60px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div className="mono" style={{ fontSize: 12, color: "var(--muted)" }}>
            {filtered.length} shown
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              onClick={() => { setAddOpen((o) => !o); setAddError(null); }}
              style={{
                background: "var(--fairway)", color: "var(--chalk)", border: "none", borderRadius: 8,
                padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer",
              }}
            >
              + Add customer
            </button>
            <SortButton active={sortBy === "name"} onClick={() => setSortBy("name")} label="Name" />
            <SortButton active={sortBy === "remaining"} onClick={() => setSortBy("remaining")} label="Lessons left" />
          </div>
        </div>

        {addOpen && (
          <div style={{ background: "#FFF", border: "1px solid var(--border)", borderRadius: 12, padding: 18, marginBottom: 18, boxShadow: "0 2px 10px rgba(27,58,47,0.06)" }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Add a customer</div>
            <p style={{ fontSize: 12, color: "var(--faint)", margin: "0 0 14px" }}>
              For importing an existing client list, or adding someone before their first booking — they'll show up
              in "New booking" right away. If they later sign in with Google using this same email, it'll connect
              to this same record automatically.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
              <input
                value={addForm.name}
                onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Full name"
                style={inputStyle}
              />
              <input
                value={addForm.email}
                onChange={(e) => setAddForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="Email"
                type="email"
                style={inputStyle}
              />
              <input
                value={addForm.phone}
                onChange={(e) => setAddForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="Phone (optional)"
                style={inputStyle}
              />
            </div>
            {addError && <p style={{ fontSize: 12, color: "#B23A3A", margin: "0 0 10px" }}>{addError}</p>}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setAddOpen(false)} style={{ background: "none", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                Cancel
              </button>
              <button
                onClick={addCustomer}
                disabled={adding}
                style={{ background: "var(--fairway)", color: "var(--chalk)", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
              >
                {adding ? "Adding…" : "Add customer"}
              </button>
            </div>
          </div>
        )}

        {filtered.length === 0 ? (
          <div style={{ background: "#FFF", border: "1px solid var(--border)", borderRadius: 14, padding: "40px 24px", textAlign: "center" }}>
            <p style={{ fontSize: 13, color: "var(--faint)", margin: 0 }}>
              {customers.length === 0 ? "No customers yet." : "Nothing matches that search."}
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {filtered.map((c) => (
              <div key={c.id} style={{
                background: "#FFF", border: "1px solid var(--border)", borderRadius: 14, padding: "16px 18px",
                boxShadow: "0 1px 3px rgba(27,58,47,0.04)",
              }}>
                <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                  <div style={{
                    width: 42, height: 42, borderRadius: "50%", flexShrink: 0,
                    background: "var(--open)", color: "var(--fairway)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontWeight: 700, fontSize: 14, fontFamily: "'IBM Plex Mono', monospace",
                    border: "1px solid var(--border)",
                  }}>
                    {initials(c.name, c.email)}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                      <div style={{ minWidth: 0 }}>
                        {editingNameId === c.id ? (
                          <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 2 }}>
                            <input
                              value={nameValue}
                              onChange={(e) => setNameValue(e.target.value)}
                              placeholder="Full name"
                              style={{ fontSize: 13, padding: "3px 6px", border: "1px solid var(--border)", borderRadius: 4, width: 150 }}
                            />
                            <button
                              onClick={() => saveName(c.id)}
                              disabled={savingName}
                              style={{ fontSize: 10, fontWeight: 700, color: "var(--fairway)", background: "none", border: "1px solid var(--border)", borderRadius: 4, padding: "2px 6px", cursor: "pointer" }}
                            >
                              {savingName ? "..." : "Save"}
                            </button>
                            <button
                              onClick={() => setEditingNameId(null)}
                              style={{ fontSize: 10, color: "var(--faint)", background: "none", border: "none", cursor: "pointer" }}
                            >
                              cancel
                            </button>
                          </div>
                        ) : (
                          <div
                            onClick={() => { setEditingNameId(c.id); setNameValue(c.name || ""); }}
                            style={{ fontWeight: 700, fontSize: 15, cursor: "pointer" }}
                            title="Click to edit name"
                          >
                            {c.name || <span style={{ color: "var(--faint)", fontWeight: 400, fontStyle: "italic" }}>No name set - click to add</span>}
                          </div>
                        )}
                        <div style={{ fontSize: 12, color: "var(--muted)" }}>
                          {c.email}{c.phone && c.phone !== "—" ? ` · ${c.phone}` : ""}
                        </div>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                        <div style={{ textAlign: "right" }}>
                          <div
                            className="mono"
                            style={{ fontWeight: 700, fontSize: 16, lineHeight: 1, color: c.totalLessonsRemaining === 0 ? "var(--faint)" : "var(--gold)" }}
                          >
                            {c.totalLessonsRemaining}
                          </div>
                          <div style={{ fontSize: 10, color: "var(--faint)", fontWeight: 600, marginTop: 2 }}>LEFT</div>
                        </div>
                        <div style={{ display: "flex", gap: 4 }}>
                          <button
                            onClick={() => messageCustomer(c.id)}
                            disabled={startingConversationId === c.id}
                            title="Message"
                            style={{
                              width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center",
                              fontSize: 13, color: "var(--fairway)", background: "var(--open)",
                              border: "none", borderRadius: 6, cursor: "pointer",
                            }}
                          >
                            {startingConversationId === c.id ? "…" : "✉"}
                          </button>
                          <button
                            onClick={() => {
                              if (window.confirm(`Delete ${c.name || c.email} from your customer list? Their booking and payment history stays on record, but they'll no longer show up here.`)) {
                                deleteCustomer(c.id);
                              }
                            }}
                            disabled={deletingId === c.id}
                            title="Delete"
                            style={{
                              width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center",
                              fontSize: 13, color: "#B23A3A", background: "#FBE9E9",
                              border: "none", borderRadius: 6, cursor: "pointer",
                            }}
                          >
                            {deletingId === c.id ? "…" : "✕"}
                          </button>
                        </div>
                      </div>
                    </div>

                    {(c.packages.length > 0 || c.fittings.length > 0) && (
                      <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #EFEBDD", display: "flex", flexDirection: "column", gap: 8 }}>
                        {c.packages.map((pkg) => (
                          <div key={pkg.id} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
                            <span className="mono" style={{
                              fontSize: 11, fontWeight: 600, color: "var(--fairway)", background: "var(--open)",
                              borderRadius: 20, padding: "3px 10px",
                            }}>
                              {pkg.label} · {pkg.lessonsRemaining}/{pkg.lessonsTotal}
                            </span>

                            {editingPackageId === pkg.id ? (
                              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                <input
                                  type="number"
                                  min={0}
                                  value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  style={{ width: 50, fontSize: 11, padding: "2px 4px", border: "1px solid var(--border)", borderRadius: 4 }}
                                />
                                <button
                                  onClick={() => saveAdjustment(pkg.id)}
                                  disabled={savingAdjustment}
                                  style={{ fontSize: 10, fontWeight: 700, color: "var(--fairway)", background: "none", border: "1px solid var(--border)", borderRadius: 4, padding: "1px 6px", cursor: "pointer" }}
                                >
                                  {savingAdjustment ? "..." : "Save"}
                                </button>
                                <button
                                  onClick={() => setEditingPackageId(null)}
                                  style={{ fontSize: 10, color: "var(--faint)", background: "none", border: "none", cursor: "pointer" }}
                                >
                                  cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => { setEditingPackageId(pkg.id); setEditValue(String(pkg.lessonsRemaining)); }}
                                style={{ fontSize: 10, color: "var(--faint)", background: "none", border: "none", padding: 0, cursor: "pointer", textDecoration: "underline" }}
                              >
                                Adjust
                              </button>
                            )}

                            {!!pkg.creditCents && (
                              <span style={{ fontSize: 10, color: "var(--faint)" }}>
                                {centsToDollars(pkg.creditCents)} credit applied
                              </span>
                            )}

                            {pkg.paymentStatus === "pending" ? (
                              <>
                                <span style={{
                                  fontSize: 10, fontWeight: 700, color: "#9A7A1E", background: "#FBF3DE",
                                  borderRadius: 4, padding: "1px 6px",
                                }}>
                                  PAYMENT DUE
                                </span>
                                <button
                                  onClick={() => markPaid(pkg.id)}
                                  disabled={markingPaid === pkg.id}
                                  style={{
                                    fontSize: 10, fontWeight: 700, color: "var(--fairway)", background: "none",
                                    border: "1px solid var(--border)", borderRadius: 4, padding: "1px 6px", cursor: "pointer",
                                  }}
                                >
                                  {markingPaid === pkg.id ? "…" : "Mark as paid"}
                                </button>
                              </>
                            ) : pkg.paymentStatus === "deposit_paid" && !!pkg.balanceDueCents ? (
                              <>
                                <span style={{
                                  fontSize: 10, fontWeight: 700, color: "#9A7A1E", background: "#FBF3DE",
                                  borderRadius: 4, padding: "1px 6px",
                                }}>
                                  {centsToDollars(pkg.balanceDueCents)} DUE AT LESSON
                                </span>
                                <button
                                  onClick={() => markPaid(pkg.id)}
                                  disabled={markingPaid === pkg.id}
                                  style={{
                                    fontSize: 10, fontWeight: 700, color: "var(--fairway)", background: "none",
                                    border: "1px solid var(--border)", borderRadius: 4, padding: "1px 6px", cursor: "pointer",
                                  }}
                                >
                                  {markingPaid === pkg.id ? "…" : "Mark as paid"}
                                </button>
                              </>
                            ) : pkg.paymentStatus === "club_billed" ? (
                              <>
                                <span style={{
                                  fontSize: 10, fontWeight: 700, color: "#9A7A1E", background: "#FBF3DE",
                                  borderRadius: 4, padding: "1px 6px",
                                }}>
                                  BILLED SEPARATELY
                                </span>
                                <button
                                  onClick={() => markPaid(pkg.id)}
                                  disabled={markingPaid === pkg.id}
                                  style={{
                                    fontSize: 10, fontWeight: 700, color: "var(--fairway)", background: "none",
                                    border: "1px solid var(--border)", borderRadius: 4, padding: "1px 6px", cursor: "pointer",
                                  }}
                                >
                                  {markingPaid === pkg.id ? "…" : "Mark received"}
                                </button>
                              </>
                            ) : null}

                            {pkg.canUpgrade && pkg.upgradeTiers.length > 0 && (
                              openUpgradeFor === pkg.id ? (
                                <>
                                  {pkg.upgradeTiers.map((tier) => (
                                    <button
                                      key={tier.id}
                                      onClick={() => upgradePackage(c.id, pkg.id, tier.id)}
                                      disabled={upgrading === pkg.id}
                                      style={{
                                        fontSize: 10, fontWeight: 700, color: "var(--fairway)", background: "var(--open)",
                                        border: "1px solid var(--border)", borderRadius: 4, padding: "2px 6px", cursor: "pointer",
                                      }}
                                    >
                                      {upgrading === pkg.id ? "…" : `→ ${tier.label} (${centsToDollars(tier.priceCents)})`}
                                    </button>
                                  ))}
                                  <button
                                    onClick={() => setOpenUpgradeFor(null)}
                                    style={{ fontSize: 10, color: "var(--faint)", background: "none", border: "none", cursor: "pointer" }}
                                  >
                                    cancel
                                  </button>
                                </>
                              ) : (
                                <button
                                  onClick={() => setOpenUpgradeFor(pkg.id)}
                                  style={{
                                    fontSize: 10, fontWeight: 700, color: "var(--gold)", background: "none",
                                    border: "1px dashed var(--border)", borderRadius: 4, padding: "1px 6px", cursor: "pointer",
                                  }}
                                >
                                  Upgrade
                                </button>
                              )
                            )}
                          </div>
                        ))}

                        {c.fittings.map((f) => (
                          <div key={f.id} style={{ fontSize: 12, color: "var(--muted)" }}>
                            <span className="mono" style={{ fontSize: 10, fontWeight: 600, color: "var(--faint)", marginRight: 6 }}>
                              FITTING
                            </span>
                            {f.label} — {new Date(f.startTime).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function SortButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
        border: active ? "1px solid var(--fairway)" : "1px solid var(--border)",
        background: active ? "var(--open)" : "#FFF", color: "var(--ink)",
      }}
    >
      {label}
    </button>
  );
}

const inputStyle: React.CSSProperties = {
  border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px", fontFamily: "inherit", fontSize: 13,
};
