"use client";

import { useEffect, useMemo, useState } from "react";

type Row = {
  key: string; customerId: string; name: string; email: string; phone: string | null;
  instructor: string | null; packageLabel: string; lessonsTotal: number | null; remaining: number | null;
  upcoming: number; taken: number; lastLesson: string | null; nextLesson: string | null;
  paymentStatus: string | null; balanceDueCents: number;
};
type SortKey = "name" | "instructor" | "remaining" | "lastLesson" | "nextLesson" | "taken";

function fmtDate(iso: string | null) {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
function paymentText(r: Row) {
  if (!r.paymentStatus) return "-";
  if (r.paymentStatus === "club_billed") return "Billed by club";
  if (r.paymentStatus === "pending") return "Pay at lesson";
  if (r.balanceDueCents > 0) return `$${(r.balanceDueCents / 100).toFixed(2)} due`;
  return "Paid";
}
function csvCell(v: unknown) {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function CustomerReport({ apiBase }: { apiBase: string }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [instructorFilter, setInstructorFilter] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  const [showFinished, setShowFinished] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<1 | -1>(1);

  useEffect(() => {
    fetch(`${apiBase}/reports/customers`)
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || "Couldn't load the customer report.");
        setRows(d.rows);
        setIsOwner(!!d.isOwner);
      })
      .catch((e) => setError(e.message || "Couldn't load the customer report."));
  }, [apiBase]);

  const instructors = useMemo(
    () => Array.from(new Set((rows || []).map((r) => r.instructor).filter(Boolean) as string[])).sort(),
    [rows]
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = (rows || []).filter((r) => {
      // A finished package = nothing left to book and nothing upcoming.
      const finished = r.remaining !== null && r.remaining <= 0 && r.upcoming === 0;
      if (!showFinished && finished) return false;
      if (instructorFilter && r.instructor !== instructorFilter) return false;
      if (lowOnly && !(r.remaining !== null && r.remaining <= 1)) return false;
      if (q && !`${r.name} ${r.email} ${r.phone || ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
    const val = (r: Row): string | number => {
      switch (sortKey) {
        case "name": return r.name.toLowerCase();
        case "instructor": return (r.instructor || "").toLowerCase();
        case "remaining": return r.remaining ?? 9999;
        case "taken": return r.taken;
        case "lastLesson": return r.lastLesson ? new Date(r.lastLesson).getTime() : 0;
        case "nextLesson": return r.nextLesson ? new Date(r.nextLesson).getTime() : Number.MAX_SAFE_INTEGER;
      }
    };
    return list.sort((a, b) => {
      const x = val(a), y = val(b);
      return (x < y ? -1 : x > y ? 1 : 0) * sortDir;
    });
  }, [rows, search, instructorFilter, lowOnly, showFinished, sortKey, sortDir]);

  function sortBy(k: SortKey) {
    if (k === sortKey) setSortDir((d) => (d === 1 ? -1 : 1));
    else { setSortKey(k); setSortDir(1); }
  }

  function downloadCsv() {
    const head = ["Customer", "Email", "Phone", "Instructor", "Package", "Lessons left", "Lessons total", "Upcoming booked", "Lessons taken", "Last lesson", "Next lesson", "Payment"];
    const lines = [head.join(",")].concat(
      visible.map((r) =>
        [r.name, r.email, r.phone, r.instructor, r.packageLabel, r.remaining, r.lessonsTotal, r.upcoming, r.taken,
          r.lastLesson ? new Date(r.lastLesson).toISOString().slice(0, 10) : "",
          r.nextLesson ? new Date(r.nextLesson).toISOString().slice(0, 10) : "",
          paymentText(r)].map(csvCell).join(",")
      )
    );
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `customer-report-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  const th = (label: string, k?: SortKey): JSX.Element => (
    <th
      onClick={k ? () => sortBy(k) : undefined}
      style={{ textAlign: "left", padding: "10px 12px", fontSize: 11, letterSpacing: "0.04em", color: "var(--muted)", whiteSpace: "nowrap", cursor: k ? "pointer" : "default", borderBottom: "1px solid var(--border)" }}
    >
      {label}{k && sortKey === k ? (sortDir === 1 ? " ▲" : " ▼") : ""}
    </th>
  );
  const td = { padding: "10px 12px", fontSize: 13, whiteSpace: "nowrap" as const, borderBottom: "1px solid var(--border)" };
  const input = { border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px", fontSize: 13, background: "#fff" };

  return (
    <section style={{ marginTop: 28 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: "var(--fairway)" }}>Customer report</div>
        <button
          type="button"
          onClick={downloadCsv}
          disabled={!visible.length}
          style={{ background: "var(--fairway)", color: "var(--chalk)", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 600, opacity: visible.length ? 1 : 0.5 }}
        >
          Download CSV
        </button>
      </div>

      {error ? (
        <p style={{ color: "#B23A3A" }}>{error}</p>
      ) : !rows ? (
        <p style={{ color: "var(--muted)" }}>Loading…</p>
      ) : (
        <>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
            <input style={{ ...input, flex: "1 1 160px" }} placeholder="Search name, email or phone" value={search} onChange={(e) => setSearch(e.target.value)} />
            {isOwner && instructors.length > 1 && (
              <select style={input} value={instructorFilter} onChange={(e) => setInstructorFilter(e.target.value)}>
                <option value="">All instructors</option>
                {instructors.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            )}
            <label style={{ fontSize: 13, display: "flex", gap: 6, alignItems: "center" }}>
              <input type="checkbox" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} /> 1 or none left
            </label>
            <label style={{ fontSize: 13, display: "flex", gap: 6, alignItems: "center" }}>
              <input type="checkbox" checked={showFinished} onChange={(e) => setShowFinished(e.target.checked)} /> Show finished packages
            </label>
          </div>

          <div style={{ overflowX: "auto", background: "#fff", border: "1px solid var(--border)", borderRadius: 12 }}>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr>
                  {th("CUSTOMER", "name")}
                  {th("INSTRUCTOR", "instructor")}
                  {th("PACKAGE")}
                  {th("LEFT", "remaining")}
                  {th("TAKEN", "taken")}
                  {th("LAST LESSON", "lastLesson")}
                  {th("NEXT LESSON", "nextLesson")}
                  {th("PAYMENT")}
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 ? (
                  <tr><td colSpan={8} style={{ ...td, color: "var(--muted)", textAlign: "center" }}>No customers match.</td></tr>
                ) : visible.map((r) => (
                  <tr key={r.key}>
                    <td style={td}>
                      <div style={{ fontWeight: 600 }}>{r.name}</div>
                      <div style={{ fontSize: 11, color: "var(--muted)" }}>{r.phone || r.email}</div>
                    </td>
                    <td style={td}>{r.instructor || "-"}</td>
                    <td style={{ ...td, textTransform: "capitalize" }}>{r.packageLabel}</td>
                    <td style={td}>
                      {r.remaining === null ? "-" : (
                        <>
                          <strong>{r.remaining}</strong> of {r.lessonsTotal}
                          {r.upcoming > 0 && <span style={{ color: "var(--muted)", fontSize: 11 }}> · {r.upcoming} booked</span>}
                        </>
                      )}
                    </td>
                    <td style={td}>{r.taken}</td>
                    <td style={td}>{fmtDate(r.lastLesson)}</td>
                    <td style={td}>{fmtDate(r.nextLesson)}</td>
                    <td style={td}>{paymentText(r)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 8 }}>
            "Left" is what can be booked today. Lessons already booked but not yet played are shown separately as "booked".
            {!isOwner && " Showing your own customers only."}
          </p>
        </>
      )}
    </section>
  );
}
