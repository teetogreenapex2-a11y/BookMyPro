import type { Metadata } from "next";

const fairway = "#1B3A2F";
const chalk = "#F6F4EE";
const gold = "#B8862B";
const border = "#E3D9C9";
const muted = "#5C6459";

export const metadata: Metadata = {
  title: "Pricing | BookMyPro",
  description:
    "One flat price per tier - every BookMyPro feature included either way. Monthly at $39.99/mo for a solo pro, or Academy at $49.99/mo + $24.99 per additional instructor for a team.",
  openGraph: {
    title: "BookMyPro Pricing",
    description: "One flat price per tier. No tiered feature restrictions - what you see is what you get.",
    url: "https://bookmypro.app/pricing",
    siteName: "BookMyPro",
    images: ["/logo.jpg"],
  },
};

const INCLUDED = [
  "Your own branded booking page and link",
  "Real-time calendar with two-way Google/Outlook sync",
  "Accept payments via Stripe or Square - your own account",
  "Sell lesson packages, club fittings, gift cards, and shop items",
  "Remote lessons with built-in video calls",
  "Swing video review with timestamped feedback and Swing Sketch",
  "Full customer list, push notifications, and in-app messaging",
  "Listing in the public \"Find a Pro\" directory",
  "Star ratings and reviews from players",
];

function Check() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, marginTop: 2 }}>
      <path d="M3 8.5L6.2 11.5L13 4.5" stroke={gold} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PlanCard({
  eyebrow, name, price, priceNote, blurb, highlighted,
}: { eyebrow: string; name: string; price: string; priceNote: string; blurb: string; highlighted?: boolean }) {
  return (
    <div
      style={{
        background: highlighted ? fairway : "#FFF",
        color: highlighted ? chalk : "inherit",
        border: `1px solid ${highlighted ? fairway : border}`,
        borderRadius: 16,
        padding: "28px 26px",
        flex: 1,
        minWidth: 260,
      }}
    >
      <div className="mono" style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: gold, marginBottom: 10 }}>
        {eyebrow}
      </div>
      <div style={{ fontFamily: "'Fraunces', serif", fontSize: 26, marginBottom: 6, color: highlighted ? chalk : fairway }}>
        {name}
      </div>
      <div style={{ fontSize: 32, fontWeight: 700, marginBottom: 4 }}>{price}</div>
      <div style={{ fontSize: 13, color: highlighted ? "#BFE3CC" : muted, marginBottom: 16 }}>{priceNote}</div>
      <p style={{ fontSize: 14, lineHeight: 1.6, color: highlighted ? "#D7DED9" : muted, marginBottom: 20 }}>{blurb}</p>
      <a
        href="/onboarding"
        style={{
          display: "block", textAlign: "center", borderRadius: 8, padding: "12px 18px", fontWeight: 700, fontSize: 14,
          textDecoration: "none",
          background: highlighted ? gold : fairway,
          color: highlighted ? fairway : chalk,
        }}
      >
        Get started
      </a>
    </div>
  );
}

export default function PricingPage() {
  return (
    <div style={{ fontFamily: "'Inter', sans-serif", color: "#14231C", background: chalk, minHeight: "100vh" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "22px 28px", maxWidth: 1120, margin: "0 auto" }}>
        <a href="/" className="mono" style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.12em", color: gold, textDecoration: "none" }}>
          BOOKMYPRO
        </a>
        <a href="/login" style={{ fontSize: 14, fontWeight: 600, color: fairway, textDecoration: "none" }}>Sign in</a>
      </header>

      <section style={{ maxWidth: 760, margin: "0 auto", padding: "20px 28px 8px", textAlign: "center" }}>
        <div className="mono" style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", color: gold, marginBottom: 14 }}>
          PRICING
        </div>
        <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: "clamp(28px, 4.5vw, 42px)", color: fairway, margin: "0 0 14px" }}>
          One price, everything included
        </h1>
        <p style={{ fontSize: 15, color: muted, lineHeight: 1.6, maxWidth: 560, margin: "0 auto" }}>
          No tiered pricing, no feature gates to unlock later - what you see below is what you get,
          on either plan. The only difference is whether you're booking lessons solo or running a team.
        </p>
      </section>

      <section style={{ maxWidth: 900, margin: "0 auto", padding: "36px 28px 20px" }}>
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
          <PlanCard
            eyebrow="SOLO PRO"
            name="Monthly"
            price="$39.99/mo"
            priceNote="flat rate, one instructor"
            blurb="For an independent instructor running their own calendar - every feature, no per-booking fees, cancel anytime."
          />
          <PlanCard
            eyebrow="TEAMS"
            name="Academy"
            price="$49.99/mo"
            priceNote="+ $24.99/mo per additional instructor"
            blurb="For a golf academy or pro shop with more than one instructor - each instructor gets their own calendar and pricing, all under one business."
            highlighted
          />
        </div>
      </section>

      <section style={{ maxWidth: 700, margin: "0 auto", padding: "20px 28px 70px" }}>
        <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 22, color: fairway, textAlign: "center", margin: "0 0 22px" }}>
          Included on every plan
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "10px 24px" }}>
          {INCLUDED.map((item) => (
            <div key={item} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <Check />
              <span style={{ fontSize: 14, color: "#3A3A3A", lineHeight: 1.5 }}>{item}</span>
            </div>
          ))}
        </div>
      </section>

      <section style={{ background: "#EFEBDD", padding: "50px 28px" }}>
        <div style={{ maxWidth: 640, margin: "0 auto" }}>
          <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 22, color: fairway, textAlign: "center", marginBottom: 28 }}>
            A couple of things people ask
          </h2>
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontWeight: 700, color: fairway, marginBottom: 6, fontSize: 15 }}>
              Where does player payment money go?
            </div>
            <p style={{ fontSize: 14, color: muted, lineHeight: 1.6, margin: 0 }}>
              Straight into your own Stripe or Square account. BookMyPro's subscription only covers
              use of the booking software itself - we're never in the middle of what a player pays you for a lesson.
            </p>
          </div>
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontWeight: 700, color: fairway, marginBottom: 6, fontSize: 15 }}>
              Is there a contract?
            </div>
            <p style={{ fontSize: 14, color: muted, lineHeight: 1.6, margin: 0 }}>
              No. It's a month-to-month subscription you can cancel anytime.
            </p>
          </div>
          <div>
            <div style={{ fontWeight: 700, color: fairway, marginBottom: 6, fontSize: 15 }}>
              What if I add instructors later?
            </div>
            <p style={{ fontSize: 14, color: muted, lineHeight: 1.6, margin: 0 }}>
              You can move from Monthly to Academy whenever your team grows - just reach out and we'll get it switched over.
            </p>
          </div>
        </div>
      </section>

      <section style={{ padding: "70px 28px", textAlign: "center" }}>
        <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: "clamp(24px, 4vw, 34px)", color: fairway, margin: "0 0 22px" }}>
          Ready to get your tee sheet in order?
        </h2>
        <a
          href="/onboarding"
          style={{
            display: "inline-block", background: fairway, color: chalk, borderRadius: 8,
            padding: "15px 34px", fontWeight: 700, fontSize: 16, textDecoration: "none",
          }}
        >
          Get started
        </a>
      </section>

      <footer style={{ borderTop: `1px solid ${border}`, padding: 28, textAlign: "center" }}>
        <div className="mono" style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: gold, marginBottom: 10 }}>
          BOOKMYPRO
        </div>
        <div style={{ display: "flex", gap: 18, justifyContent: "center", fontSize: 13, color: muted }}>
          <a href="/privacy" style={{ color: muted, textDecoration: "none" }}>Privacy Policy</a>
          <span>&copy; {new Date().getFullYear()} BookMyPro</span>
        </div>
      </footer>
    </div>
  );
}
