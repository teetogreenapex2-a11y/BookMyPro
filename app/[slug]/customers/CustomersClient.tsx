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
    paymentStatus?: string; creditCents?: number; canUpgrade?: boolean; upgradeTiers: UpgradeTier[];
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
  const [upgrading, setUpgrading] = useState<string | null>(null);
  const [openUpgradeFor, setOpenUpgradeFor] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({ name: "", email: "", phone: "" });
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

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
          packages: c.packages.map((p) => (p.id === packageId ? { ...p, paymentStatus: "paid" } : p)),
        }))
      );
    }
    setMarkingPaid(null);
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

  return (
    <div style={{ minHeight: "100vh" }}>
      <header style={{ background: "var(--fairway)", color: "var(--chalk)", padding: "24px 20px" }}>
        <div style={{ maxWidth: 960, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <h1 className="display" style={{ fontSize: 24, margin: 0 }}>Customers</h1>
            <a href={`${basePath}/instructor`} style={{ fontSize: 13, color: "#D7DED9", textDecoration: "none" }}>
              ← Back
            </a>
          </div>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or email…"
            style={{
              width: "100%", border: "none", borderRadius: 8, padding: "10px 12px",
              fontFamily: "inherit", fontSize: 14, background: "rgba(255,255,255,0.1)", color: "var(--chalk)",
            }}
          />
        </div>
      </header>

      <main style={{ maxWidth: 960, margin: "0 auto", padding: "20px 20px 60px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div className="mono" style={{ fontSize: 12, color: "var(--muted)" }}>
            {filtered.length} customer{filtered.length !== 1 ? "s" : ""}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              onClick={() => { setAddOpen((o) => !o); setAddError(null); }}
              style={{
                background: "var(--fairway)", color: "var(--chalk)", border: "none", borderRadius: 8,
                padding: "6px 12px", fontSize: 12, fontWeight: 700,
              }}
            >
              + Add customer
            </button>
            <SortButton active={sortBy === "name"} onClick={() => setSortBy("name")} label="Name" />
            <SortButton active={sortBy === "remaining"} onClick={() => setSortBy("remaining")} label="Lessons left" />
          </div>
        </div>

        {addOpen && (
          <div style={{ background: "#FFF", border: "1px solid var(--border)", borderRadius: 12, padding: 16, marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Add a customer</div>
            <p style={{ fontSize: 12, color: "var(--faint)", margin: "0 0 12px" }}>
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
              <button onClick={() => setAddOpen(false)} style={{ background: "none", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 600 }}>
                Cancel
              </button>
              <button
                onClick={addCustomer}
                disabled={adding}
                style={{ background: "var(--fairway)", color: "var(--chalk)", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 700 }}
              >
                {adding ? "Adding…" : "Add customer"}
              </button>
            </div>
          </div>
        )}

        {/* Desktop table */}
        <div className="customers-table" style={{ background: "#FFF", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden" }}>
          <div style={rowGrid("header")}>
            <div style={headCell}>Customer</div>
            <div style={headCell}>Signed up for</div>
            <div style={headCell}>Fittings booked</div>
            <div style={{ ...headCell, textAlign: "right" }}>Lessons left</div>
          </div>
          {filtered.length === 0 && (
            <div style={{ padding: 24, textAlign: "center", color: "var(--faint)", fontSize: 13 }}>
              No customers yet.
            </div>
          )}
          {filtered.map((c, idx) => (
            <div key={c.id} style={rowGrid("body", idx)}>
              <div style={bodyCell}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{c.name}</div>
                <div style={{ fontSize: 12, color: "var(--muted)" }}>{c.email}</div>
                <div style={{ fontSize: 12, color: "var(--faint)" }}>{c.phone}</div>
              </div>
              <div style={bodyCell}>
                {c.packages.length === 0 ? (
                  <span style={{ fontSize: 12, color: "var(--faint)" }}>No packages</span>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {c.packages.map((pkg) => (
                      <div key={pkg.id}>
                        <span className="mono" style={{ fontSize: 11, color: "var(--fairway)" }}>
                          {pkg.label} ({pkg.lessonsRemaining}/{pkg.lessonsTotal} left)
                        </span>
                        {!!pkg.creditCents && (
                          <div style={{ fontSize: 10, color: "var(--faint)" }}>
                            {centsToDollars(pkg.creditCents)} credit applied
                          </div>
                        )}
                        {pkg.paymentStatus === "pending" ? (
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
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
                          </div>
                        ) : null}
                        {pkg.canUpgrade && pkg.upgradeTiers.length > 0 && (
                          <div style={{ marginTop: 4 }}>
                            {openUpgradeFor === pkg.id ? (
                              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
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
                              </div>
                            ) : (
                              <button
                                onClick={() => setOpenUpgradeFor(pkg.id)}
                                style={{
                                  fontSize: 10, fontWeight: 700, color: "var(--gold)", background: "none",
                                  border: "1px dashed var(--border)", borderRadius: 4, padding: "1px 6px", cursor: "pointer",
                                }}
                              >
                                Upgrade to a package
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div style={bodyCell}>
                {c.fittings.length === 0 ? (
                  <span style={{ fontSize: 12, color: "var(--faint)" }}>None</span>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {c.fittings.map((f) => (
                      <span key={f.id} style={{ fontSize: 12 }}>
                        {f.label} —{" "}
                        <span style={{ color: "var(--muted)" }}>
                          {new Date(f.startTime).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                        </span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ ...bodyCell, textAlign: "right" }}>
                <span
                  className="mono"
                  style={{
                    fontWeight: 700, fontSize: 14,
                    color: c.totalLessonsRemaining === 0 ? "var(--faint)" : "var(--gold)",
                  }}
                >
                  {c.totalLessonsRemaining}
                </span>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

function SortButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600,
        border: active ? "1px solid var(--fairway)" : "1px solid var(--border)",
        background: active ? "var(--open)" : "#FFF", color: "var(--ink)",
      }}
    >
      {label}
    </button>
  );
}

function rowGrid(kind: "header" | "body", idx?: number): React.CSSProperties {
  return {
    display: "grid",
    gridTemplateColumns: "1.4fr 1.3fr 1.1fr 0.7fr",
    borderTop: kind === "body" && idx !== 0 ? "1px solid #EFEBDD" : kind === "header" ? "none" : "none",
    background: kind === "header" ? "#EFEBDD" : "#FFF",
  };
}

const headCell: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: "var(--muted)", padding: "10px 14px",
  textTransform: "uppercase", letterSpacing: "0.04em",
};

const inputStyle: React.CSSProperties = {
  border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px", fontFamily: "inherit", fontSize: 13,
};

const bodyCell: React.CSSProperties = {
  padding: "14px", fontSize: 13,
};
