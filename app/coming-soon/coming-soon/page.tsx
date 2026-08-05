export const metadata = {
  title: "BookMyPro - Coming Soon",
  description: "Booking software for golf instructors. Coming soon.",
};

export default function ComingSoonPage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#1B3A2F",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        fontFamily: "'Inter', sans-serif",
        textAlign: "center",
      }}
    >
      <div style={{ maxWidth: 440 }}>
        <div
          className="mono"
          style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.14em", color: "#B8862B", marginBottom: 22 }}
        >
          BOOKMYPRO
        </div>
        <h1
          style={{
            fontFamily: "'Fraunces', serif",
            fontSize: "clamp(30px, 6vw, 44px)",
            lineHeight: 1.15,
            color: "#F6F4EE",
            margin: "0 0 18px",
          }}
        >
          Something's coming<br />to the tee sheet.
        </h1>
        <p style={{ fontSize: 15, color: "#BFE3CC", lineHeight: 1.6, margin: 0 }}>
          Booking software built for golf instructors — real-time scheduling, automatic payments,
          and swing video review, all in one place. Launching soon.
        </p>
      </div>
    </div>
  );
}
