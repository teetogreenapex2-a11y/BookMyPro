"use client";

import { useState } from "react";

type Listing = {
  slug: string;
  name: string;
  city: string | null;
  state: string | null;
  distanceMiles?: number;
  memberships: { specialty: string | null; user: { name: string | null } }[];
};

export default function FindAProPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Listing[]>([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  async function search() {
    setLoading(true);
    setSearched(true);
    setLocationError(null);
    const res = await fetch(`/api/directory?q=${encodeURIComponent(query)}`);
    const data = await res.json();
    setResults(Array.isArray(data) ? data : []);
    setLoading(false);
  }

  function searchNearMe() {
    if (!("geolocation" in navigator)) {
      setLocationError("Your browser doesn't support location search - try typing a city instead.");
      return;
    }
    setLocating(true);
    setLocationError(null);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        setLoading(true);
        setSearched(true);
        const res = await fetch(`/api/directory?lat=${latitude}&lng=${longitude}&radius=50`);
        const data = await res.json();
        setResults(Array.isArray(data) ? data : []);
        setLoading(false);
        setLocating(false);
      },
      () => {
        setLocationError("Couldn't get your location - check your browser's permission settings, or try typing a city instead.");
        setLocating(false);
      }
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#F6F4EE", fontFamily: "sans-serif" }}>
      <header style={{ background: "#1B3A2F", color: "#F6F4EE", padding: "28px 20px" }}>
        <div style={{ maxWidth: 560, margin: "0 auto" }}>
          <img src="/logo.jpg" alt="" style={{ width: 36, height: 36, borderRadius: 8, objectFit: "cover", marginBottom: 8 }} />
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: "#B8862B", marginBottom: 10 }}>BOOKMYPRO</div>
          <h1 style={{ fontSize: 26, margin: "0 0 8px" }}>Find a Pro</h1>
          <p style={{ fontSize: 14, color: "#D7DED9", margin: 0 }}>
            Search for instructors and coaches near you.
          </p>
        </div>
      </header>

      <main style={{ maxWidth: 560, margin: "0 auto", padding: "24px 20px 60px" }}>
        <button
          onClick={searchNearMe}
          disabled={locating}
          style={{
            width: "100%", background: "#B8862B", color: "#1B3A2F", border: "none", borderRadius: 8,
            padding: "12px 16px", fontSize: 14, fontWeight: 700, marginBottom: 12,
          }}
        >
          {locating ? "Finding your location..." : "Use my current location"}
        </button>

        {locationError && (
          <p style={{ fontSize: 12.5, color: "#B23A3A", marginBottom: 12 }}>{locationError}</p>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "12px 0" }}>
          <div style={{ flex: 1, height: 1, background: "#E3D9C9" }} />
          <span style={{ fontSize: 11, color: "#8A8571" }}>OR SEARCH BY CITY</span>
          <div style={{ flex: 1, height: 1, background: "#E3D9C9" }} />
        </div>

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
            {loading ? "Searching..." : "Search"}
          </button>
        </div>

        {searched && !loading && results.length === 0 && (
          <p style={{ fontSize: 13, color: "#8A8571" }}>No pros found nearby yet.</p>
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
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#1B3A2F", marginBottom: 4 }}>{b.name}</div>
                {typeof b.distanceMiles === "number" && (
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: "#8A8571", whiteSpace: "nowrap" }}>
                    {b.distanceMiles < 1 ? "less than 1 mi" : `${Math.round(b.distanceMiles)} mi`}
                  </span>
                )}
              </div>
              {(b.city || b.state) && (
                <div style={{ fontSize: 12.5, color: "#8A8571", marginBottom: 8 }}>
                  {[b.city, b.state].filter(Boolean).join(", ")}
                </div>
              )}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {b.memberships.map((m, i) => (
                  <span key={i} style={{ fontSize: 11.5, background: "#E3D9C9", borderRadius: 20, padding: "3px 10px" }}>
                    {m.user.name || "Instructor"}{m.specialty ? ` - ${m.specialty}` : ""}
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
