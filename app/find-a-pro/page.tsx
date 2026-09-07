"use client";

import FindProSearch from "@/app/components/FindProSearch";

export default function FindAProPage() {
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
        <FindProSearch />
      </main>
    </div>
  );
}
