import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { businessDestination } from "@/lib/businessUrl";

export default async function HomePage() {
  const session = await getServerSession(authOptions);
  if (!session) return <MarketingPage />;

  const userId = (session.user as any).id;
  const memberships = await prisma.membership.findMany({
    where: { userId },
    include: { business: true },
  });

  if (memberships.length === 1) {
    const m = memberships[0];
    const destination = m.role === "owner" || m.role === "instructor" ? "instructor" : "book";
    redirect(businessDestination(m.business.slug, `/${destination}`));
  }

  if (memberships.length === 0) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "sans-serif", background: "#1B3A2F" }}>
        <div style={{ background: "#F6F4EE", borderRadius: 16, padding: "36px 32px", maxWidth: 380, width: "100%", textAlign: "center" }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: "#B8862B", marginBottom: 14 }}>BOOKMYPRO</div>
          <h1 style={{ fontSize: 22, marginBottom: 24, color: "#1B3A2F" }}>What brings you here?</h1>
<a
          
            href="/find-a-pro"
            style={{ display: "block", background: "#1B3A2F", color: "#F6F4EE", borderRadius: 8, padding: "13px 20px", fontWeight: 700, fontSize: 14, textDecoration: "none", marginBottom: 10 }}
          >
            I'm looking to book a lesson
          </a>
<a
          
            href="/onboarding"
            style={{ display: "block", background: "none", color: "#1B3A2F", border: "1px solid #E3D9C9", borderRadius: 8, padding: "13px 20px", fontWeight: 600, fontSize: 14, textDecoration: "none" }}
          >
            I'm a coach or instructor
          </a>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", padding: 24, fontFamily: "sans-serif" }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: "#B8862B", marginBottom: 8 }}>BOOKMYPRO</div>
      <h1 style={{ fontSize: 20, marginBottom: 16 }}>Choose a business</h1>
      <ul style={{ listStyle: "none", padding: 0, display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
        {memberships.map((m) => {
          const destination = m.role === "owner" || m.role === "instructor" ? "instructor" : "book";
          return (
            <li key={m.id}>
              <a href={businessDestination(m.business.slug, `/${destination}`)} style={{ color: "#1B3A2F", fontWeight: 600 }}>
                {m.business.name} - <span style={{ fontWeight: 400, color: "#5C6459" }}>{m.role}</span>
              </a>
            </li>
          );
        })}
      </ul>
      <a href="/onboarding" style={{ fontSize: 13, color: "#5C6459" }}>+ Create another business</a>
    </div>
  );
}

function MarketingPage() {
  const slots = [
    { time: "8:00", label: "Open", status: "open" },
    { time: "9:00", label: "D. Reyes - Driver", status: "booked" },
    { time: "10:00", label: "Open", status: "open" },
    { time: "11:00", label: "M. Okafor - Playing lsn", status: "booked" },
    { time: "12:00", label: "T. Alvarez - pending", status: "pending" },
    { time: "1:00", label: "Open", status: "open" },
    { time: "2:00", label: "S. Whitfield - Fitting", status: "booked" },
  ];

  return (
    <div style={{ fontFamily: "'Inter', sans-serif", color: "#14231C", background: "#F6F4EE" }}>
      <style>{`
        @media (max-width: 860px) {
          .hero-grid { grid-template-columns: 1fr !important; }
          .hero-copy { text-align: center; align-items: center; }
          .hero-copy .eyebrow, .hero-copy h1, .hero-copy p { max-width: 100% !important; }
        }
        .feature-card:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(27,58,47,0.08); }
        .cta-btn:hover { background: #B8862B !important; color: #1B3A2F !important; }
      `}</style>

      {/* Header */}
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "22px 28px", maxWidth: 1120, margin: "0 auto" }}>
        <div className="mono" style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.12em", color: "#B8862B" }}>BOOKMYPRO</div>
        <a href="/login" style={{ fontSize: 14, fontWeight: 600, color: "#1B3A2F", textDecoration: "none" }}>Sign in</a>
      </header>

      {/* Hero */}
      <section style={{ maxWidth: 1120, margin: "0 auto", padding: "40px 28px 80px" }}>
        <div className="hero-grid" style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: 56, alignItems: "center" }}>
          <div className="hero-copy" style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
            <div className="mono eyebrow" style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", color: "#B8862B", marginBottom: 18, maxWidth: 420 }}>
              BOOKING SOFTWARE FOR GOLF INSTRUCTORS
            </div>
            <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: "clamp(32px, 5vw, 52px)", lineHeight: 1.08, margin: "0 0 20px", color: "#1B3A2F", maxWidth: 480 }}>
              Your tee sheet,<br />finally organized.
            </h1>
            <p style={{ fontSize: 16, color: "#4A5449", lineHeight: 1.6, margin: "0 0 28px", maxWidth: 420 }}>
              Players book lessons and fittings straight into your calendar, pay automatically,
              and send you their swing for review — all from a page with your own name on it.
            </p>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <a
                href="/onboarding"
                className="cta-btn"
                style={{
                  display: "inline-block", background: "#1B3A2F", color: "#F6F4EE", borderRadius: 8,
                  padding: "13px 26px", fontWeight: 700, fontSize: 15, textDecoration: "none", transition: "all 0.15s",
                }}
              >
                Get started
              </a>
              <a
                href="/login"
                style={{
                  display: "inline-block", background: "none", color: "#1B3A2F", border: "1px solid #D8D1BF", borderRadius: 8,
                  padding: "13px 26px", fontWeight: 600, fontSize: 15, textDecoration: "none",
                }}
              >
                Sign in
              </a>
            </div>
          </div>

          {/* Signature element: a live-feeling tee sheet, in the app's real slot-status colors */}
          <div style={{
            background: "#1B3A2F", borderRadius: 16, padding: "20px 18px", boxShadow: "0 20px 60px rgba(15,36,28,0.25)",
          }}>
            <div className="mono" style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "#BFE3CC", marginBottom: 4 }}>
              TUESDAY, AUG 4
            </div>
            <div style={{ fontFamily: "'Fraunces', serif", fontSize: 18, color: "#F6F4EE", marginBottom: 14 }}>
              Today's tee sheet
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {slots.map((s) => {
                const bg = s.status === "booked" ? "#0F241C" : s.status === "pending" ? "transparent" : "rgba(191,227,204,0.12)";
                const border = s.status === "pending" ? "1px dashed #B8862B" : "none";
                const color = s.status === "open" ? "#BFE3CC" : "#F6F4EE";
                return (
                  <div
                    key={s.time}
                    style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      background: bg, border, borderRadius: 8, padding: "9px 12px",
                    }}
                  >
                    <span className="mono" style={{ fontSize: 12, color: color, opacity: 0.85 }}>{s.time}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color }}>{s.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section style={{ maxWidth: 1120, margin: "0 auto", padding: "0 28px 80px" }}>
        <div className="mono" style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", color: "#B8862B", marginBottom: 10, textAlign: "center" }}>
          EVERYTHING INCLUDED
        </div>
        <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 32, color: "#1B3A2F", textAlign: "center", margin: "0 0 40px" }}>
          Built around how a lesson day actually runs
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 18 }}>
          {[
            { title: "Real-time booking", body: "Players see your real open slots and book instantly - no back-and-forth texting to find a time." },
            { title: "Get paid automatically", body: "Stripe or Square charges the card the moment someone books, straight into your own account." },
            { title: "Swing video review", body: "Players send a swing, you mark it up frame by frame and send it back with real feedback." },
            { title: "Packages & memberships", body: "Sell lesson bundles once, and credits track themselves automatically as they're used." },
            { title: "Two-way calendar sync", body: "Google Calendar or Outlook, kept in agreement with your BookMyPro schedule both ways." },
            { title: "Your own branded page", body: "Your logo, your colors, your own booking link - not a generic third-party scheduler." },
          ].map((f) => (
            <div
              key={f.title}
              className="feature-card"
              style={{
                background: "#FFF", border: "1px solid #E3D9C9", borderRadius: 14, padding: "22px 20px",
                transition: "transform 0.15s, box-shadow 0.15s",
              }}
            >
              <div style={{ fontFamily: "'Fraunces', serif", fontSize: 18, color: "#1B3A2F", marginBottom: 8 }}>{f.title}</div>
              <div style={{ fontSize: 14, color: "#5C6459", lineHeight: 1.55 }}>{f.body}</div>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section style={{ background: "#EFEBDD", padding: "70px 28px" }}>
        <div style={{ maxWidth: 1120, margin: "0 auto" }}>
          <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 32, color: "#1B3A2F", textAlign: "center", margin: "0 0 44px" }}>
            Up and running in three steps
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 28 }}>
            {[
              { n: "01", title: "Set your hours & pricing", body: "Tell us when you're open and what a lesson costs - the calendar builds itself from there." },
              { n: "02", title: "Share your booking link", body: "Your own page, ready to send to players by text, email, or your website." },
              { n: "03", title: "Players book, you get paid", body: "Bookings land straight on your calendar, payment included, no extra steps." },
            ].map((s) => (
              <div key={s.n}>
                <div className="mono" style={{ fontSize: 13, fontWeight: 700, color: "#B8862B", marginBottom: 10 }}>{s.n}</div>
                <div style={{ fontFamily: "'Fraunces', serif", fontSize: 19, color: "#1B3A2F", marginBottom: 6 }}>{s.title}</div>
                <div style={{ fontSize: 14, color: "#5C6459", lineHeight: 1.55 }}>{s.body}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: "80px 28px", textAlign: "center" }}>
        <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: "clamp(26px, 4vw, 38px)", color: "#1B3A2F", margin: "0 0 22px" }}>
          Ready to get your tee sheet in order?
        </h2>
        <a
          href="/onboarding"
          className="cta-btn"
          style={{
            display: "inline-block", background: "#1B3A2F", color: "#F6F4EE", borderRadius: 8,
            padding: "15px 34px", fontWeight: 700, fontSize: 16, textDecoration: "none", transition: "all 0.15s",
          }}
        >
          Get started
        </a>
      </section>

      {/* Footer */}
      <footer style={{ borderTop: "1px solid #E3D9C9", padding: "28px", textAlign: "center" }}>
        <div className="mono" style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: "#B8862B", marginBottom: 10 }}>
          BOOKMYPRO
        </div>
        <div style={{ display: "flex", gap: 18, justifyContent: "center", fontSize: 13, color: "#5C6459" }}>
          <a href="/privacy" style={{ color: "#5C6459", textDecoration: "none" }}>Privacy Policy</a>
          <span>&copy; {new Date().getFullYear()} BookMyPro</span>
        </div>
      </footer>
    </div>
  );
}
