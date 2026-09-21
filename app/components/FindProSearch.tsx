"use client";

import { useState } from "react";
import { formatCityState } from "@/lib/format";

type Listing = {
  slug: string;
  name: string;
  city: string | null;
  state: string | null;
  distanceMiles?: number;
  memberships: { specialty: string | null; user: { name: string | null } }[];
};

export default function FindProSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Listing[]>([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [inviteSent, setInviteSent] = useState(false);

  async function handleInvite() {
    const shareText =
      "I use BookMyPro to book golf lessons - if you're a golf instructor, you can set up your own booking page here:";
    const shareUrl = "https://bookmypro.app/onboarding";
    if (navigator.share) {
      try {
        await navigator.share({ text: shareText, url: shareUrl });
      } catch {
        // User cancelled the native share sheet - not an error, do nothing.
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(`${shareText} ${shareUrl}`);
      setInviteSent(true);
      setTimeout(() => setInviteSent(false), 2500);
    } catch {
      // Clipboard blocked - nothing more we can do here silently.
    }
  }

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
      setLocationError("Your browser doesn't support location search - try typing a city, state, or zip instead.");
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
        setLocationError("Couldn't get your location - check your browser's permission settings, or try typing a city, state, or zip instead.");
        setLocating(false);
      }
    );
  }

  return (
    <div>
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
        <span style={{ fontSize: 11, color: "#8A8571" }}>OR SEARCH BY CITY, STATE, OR ZIP</span>
        <div style={{ flex: 1, height: 1, background: "#E3D9C9" }} />
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search()}
          placeholder="City, state, or zip"
          // minWidth: 0 overrides a flex item's default min-width of "auto",
          // which otherwise refuses to let this input shrink below its own
          // content size - on a narrow phone screen that pushed the Search
          // button straight off the edge instead of the input just getting
          // narrower, which is what flex: 1 was supposed to accomplish.
          style={{ flex: 1, minWidth: 0, border: "1px solid #E3D9C9", borderRadius: 8, padding: "10px 14px", fontSize: 14 }}
        />
        <button
          onClick={search}
          disabled={loading}
          style={{ flexShrink: 0, background: "#1B3A2F", color: "#F6F4EE", border: "none", borderRadius: 8, padding: "10px 20px", fontSize: 14, fontWeight: 700 }}
        >
          {loading ? "Searching..." : "Search"}
        </button>
      </div>

      {searched && !loading && results.length === 0 && (
        <div style={{ background: "#FFF", border: "1px solid #E3D9C9", borderRadius: 12, padding: 18, marginBottom: 12 }}>
          <p style={{ fontSize: 13.5, color: "#3A3A3A", margin: "0 0 4px", fontWeight: 700 }}>
            No pros in your area yet
          </p>
          <p style={{ fontSize: 13, color: "#8A8571", margin: "0 0 14px", lineHeight: 1.5 }}>
            We're adding new instructors all the time - check back soon. If you already have a
            golf pro, let them know BookMyPro exists so they can get set up.
          </p>
          <button
            onClick={handleInvite}
            style={{
              width: "100%", background: "#1B3A2F", color: "#F6F4EE", border: "none", borderRadius: 8,
              padding: "11px 16px", fontSize: 13.5, fontWeight: 700,
            }}
          >
            {inviteSent ? "Link copied!" : "Tell your pro about BookMyPro"}
          </button>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {results.map((b) => (
          <a
            key={b.slug}
            href={`/${b.slug}/book`}
            // The booking page itself is browsable without an account now -
            // Apple's App Review rejected an earlier version of this app
            // (guideline 5.1.1(v)) for gating "who's available and when" on
            // registration, which is exactly what forcing a login redirect
            // here would do. It only ever asks for sign-in at the moment
            // someone actually tries to confirm a real booking.
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
                {formatCityState(b.city, b.state)}
              </div>
            )}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {b.memberships
                // A solo pro's business is often just named after
                // themselves ("Rick Stitzer") - for that one-instructor
                // case, repeating their name again right below the
                // heading just looks like a duplicate. Their specialty
                // (if they have one) is still worth showing on its own.
                .filter((m) => !(b.memberships.length === 1 && (m.user.name || "").trim().toLowerCase() === b.name.trim().toLowerCase()) || m.specialty)
                .map((m, i) => (
                  <span key={i} style={{ fontSize: 11.5, background: "#E3D9C9", borderRadius: 20, padding: "3px 10px" }}>
                    {b.memberships.length === 1 && (m.user.name || "").trim().toLowerCase() === b.name.trim().toLowerCase()
                      ? m.specialty
                      : `${m.user.name || "Instructor"}${m.specialty ? ` - ${m.specialty}` : ""}`}
                  </span>
                ))}
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
