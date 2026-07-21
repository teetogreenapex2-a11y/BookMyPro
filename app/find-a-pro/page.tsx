"use client";

import { useState } from "react";

type Listing = {
  slug: string;
  name: string;
  city: string | null;
  state: string | null;
  memberships: { specialty: string | null; user: { name: string | null } }[];
};

export default function FindAProPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Listing[]>([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);

  async function search() {
    setLoading(true);
    setSearched(true);
    const res = await fetch(`/api/directory?q=${encodeURIComponent(query)}`);
    const data = await res.json();
    setResults(Array.isArray(data) ? data : []);
    setLoading(false);
  }

  return (
    <div style={{ minHeight: "100vh", background: "#F6F4EE", fontFamily: "sans-serif" }}>
      <header style={{ background: "#1B3A2F", color: "#F6F4EE", padding: "28px 20px" }}>
        <div style={{ maxWidth: 560, margin: "0 auto" }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: "#B8862B", marginBottom: 10 }}>BOOKMYPRO</div>
          <h1 style={{ fontSize: 26, margin: "0 0 8px" }}>Find a Pro</h1>
          <p style={{ fontSize: 14, color: "#D7DED9", margin: 0 }}>
            Search for instructors and coaches near you.
          </p>
        </div>
      </header>

      <main style={{ maxWidth: 560, margin: "0 auto", padding: "24px 20px 60px" }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
            placeholder="City, state, or zip"
            style={{ flex: 1, border: "1px solid #E3D9C9", borderRadius: 8, padding: "10px 14px", fontSize: 14 }}
          />
          <button
            onClick={search}
            disabled={loading}
            style={{ background: "#1B3A2F", color: "#F6F4EE", border: "none", borderRadius: 8, padding: "10px 20px", fontSize: 14, fontWeight: 700 }}
          >
            {loading ? "Searching…" : "Search"}
          </button>
        </div>

        {searched && !loading && results.length === 0 && (
          <p style={{ fontSize: 13, color: "#8A8571" }}>No pros found for that search yet.</p>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {results.map((b) => (
            <a
              key={b.slug}
              href={`/${b.slug}/book`}
              style={{
                display: "block", background: "#FFF", border: "1px solid #E3D9C9", borderRadius: 12,
                padding: 16, textDecoration: "none", color: "inherit",
              }}
            >
              <div style={{ fontSize: 16, fontWeight: 700, color: "#1B3A2F", marginBottom: 4 }}>{b.name}</div>
              {(b.city || b.state) && (
                <div style={{ fontSize: 12.5, color: "#8A8571", marginBottom: 8 }}>
                  {[b.city, b.state].filter(Boolean).join(", ")}
                </div>
              )}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {b.memberships.map((m, i) => (
                  <span key={i} style={{ fontSize: 11.5, background: "#E3D9C9", borderRadius: 20, padding: "3px 10px" }}>
                    {m.user.name || "Instructor"}{m.specialty ? ` — ${m.specialty}` : ""}
                  </span>
                ))}
              </div>
            </a>
          ))}
        </div>
      </main>
    </div>
  );
}
