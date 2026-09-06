"use client";

import { useEffect, useState } from "react";

type InstructorFigure = { instructorMembershipId: string; name: string; revenueCents: number; count: number };
type PeriodFigures = {
  byInstructor: InstructorFigure[];
  totals: {
    lessonRevenueCents: number;
    lessonCount: number;
    giftCardRevenueCents: number | null;
    giftCardCount: number | null;
    shopRevenueCents: number | null;
    shopOrderCount: number | null;
    combinedRevenueCents: number;
  };
};
type ReportData = { daily: PeriodFigures; monthly: PeriodFigures; ytd: PeriodFigures };

function formatDollars(cents: number) {
  return (cents / 100).toLocaleString(undefined, { style: "currency", currency: "USD" });
}

export default function ReportsClient({
  businessName, isOwner, basePath, apiBase,
}: { businessName: string; isOwner: boolean; basePath: string; apiBase: string }) {
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/reports`);
      if (res.ok) {
        setData(await res.json());
      } else {
        const d = await res.json().catch(() => ({}));
        setError(d.error || "Couldn't load your figures.");
      }
    } catch {
      setError("Couldn't reach the server - check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  function PeriodSection({ title, figures }: { title: string; figures: PeriodFigures }) {
    return (
      <div style={{ background: "#FFF", border: "1px solid var(--border)", borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: "var(--fairway)", marginBottom: 12 }}>{title}</div>

        {figures.byInstructor.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
            {figures.byInstructor.map((i) => (
              <div key={i.instructorMembershipId} style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5 }}>
                <span>{i.name}</span>
                <span style={{ color: "var(--muted)" }}>
                  {formatDollars(i.revenueCents)} <span style={{ fontSize: 12 }}>({i.count} lesson{i.count === 1 ? "" : "s"})</span>
                </span>
              </div>
            ))}
          </div>
        )}

        <div style={{ borderTop: "1px solid var(--border)", paddingTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5, fontWeight: 700 }}>
            <span>Lessons & fittings</span>
            <span>{formatDollars(figures.totals.lessonRevenueCents)} ({figures.totals.lessonCount})</span>
          </div>
          {isOwner && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--muted)" }}>
                <span>Gift cards sold</span>
                <span>{formatDollars(figures.totals.giftCardRevenueCents || 0)} ({figures.totals.giftCardCount || 0})</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--muted)" }}>
                <span>Shop orders</span>
                <span>{formatDollars(figures.totals.shopRevenueCents || 0)} ({figures.totals.shopOrderCount || 0})</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14.5, fontWeight: 700, color: "var(--fairway)", marginTop: 4, paddingTop: 6, borderTop: "1px dashed var(--border)" }}>
                <span>Total</span>
                <span>{formatDollars(figures.totals.combinedRevenueCents)}</span>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--chalk)" }}>
      <header style={{ background: "var(--fairway)", color: "var(--chalk)", padding: "24px 20px" }}>
        <div style={{ maxWidth: 560, margin: "0 auto" }}>
          <a href={`${basePath}/instructor`} style={{ color: "#D7DED9", textDecoration: "none", fontSize: 13 }}>&larr; Back</a>
          <h1 className="display" style={{ fontSize: 24, margin: "6px 0 0" }}>Reports</h1>
          <p style={{ fontSize: 13, color: "#D7DED9", margin: "4px 0 0" }}>{businessName}</p>
        </div>
      </header>

      <main style={{ maxWidth: 560, margin: "0 auto", padding: "20px 20px 60px" }}>
        {loading ? (
          <p style={{ color: "var(--muted)" }}>Loading…</p>
        ) : error ? (
          <p style={{ color: "#B23A3A" }}>{error}</p>
        ) : data ? (
          <>
            <PeriodSection title="Today" figures={data.daily} />
            <PeriodSection title="This month" figures={data.monthly} />
            <PeriodSection title="Year to date" figures={data.ytd} />
            {!isOwner && (
              <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
                Showing your own figures only.
              </p>
            )}
          </>
        ) : null}
      </main>
    </div>
  );
}
