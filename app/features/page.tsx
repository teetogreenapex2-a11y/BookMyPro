import type { Metadata } from "next";

// Belt-and-suspenders with robots.txt - this is a more direct, page-level
// signal to search engines not to index this specific page, which still
// applies even in edge cases where robots.txt alone might not (e.g. if
// the page ever gets linked to from somewhere outside this app).
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function FeaturesPage() {
  return (
    <div style={{ minHeight: "100vh", background: "#F6F4EE", fontFamily: "sans-serif" }}>
      <header style={{ background: "#1B3A2F", color: "#F6F4EE", padding: "28px 20px" }}>
        <div style={{ maxWidth: 640, margin: "0 auto" }}>
          <a href="/onboarding" style={{ display: "inline-block", color: "#D7DED9", fontSize: 13, textDecoration: "none", marginBottom: 12 }}>
            {"<"} Back to onboarding
          </a>
          <img src="/logo.jpg" alt="" style={{ width: 36, height: 36, borderRadius: 8, objectFit: "cover", marginBottom: 8 }} />
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: "#B8862B", marginBottom: 10 }}>BOOKMYPRO</div>
          <h1 style={{ fontSize: 26, margin: "0 0 8px" }}>Everything included</h1>
          <p style={{ fontSize: 14, color: "#D7DED9", margin: 0 }}>
            Here's what you get, on both sides of the app.
          </p>
        </div>
      </header>

      <main style={{ maxWidth: 640, margin: "0 auto", padding: "28px 20px 60px" }}>
        <Section title="For You (Instructor / Owner)">
          <Group title="Setup & Branding" items={[
            "Guided onboarding wizard - business info, pricing, team, calendar, and payment setup in one flow",
            "Custom booking page with your own URL",
            "Upload your own business logo, shown throughout your booking page",
            "List your business in the public \"Find a Pro\" directory, with real distance-based search",
            "Multi-instructor support - add other instructors, each with their own calendar and pricing",
          ]} />
          <Group title="Calendar & Bookings" items={[
            "Visual weekly calendar - tap to open/close time slots",
            "Two-way sync with Google Calendar or Outlook",
            "24-hour minimum lead time for player-initiated bookings",
            "Optional approval step for new bookings",
            "Create a booking manually for any customer, new or existing",
            "Sell a new lesson package and book a lesson in one motion, or sell it alone for them to schedule later",
          ]} />
          <Group title="Payments" items={[
            "Accept payments directly via Stripe or Square - your own account, your own money",
            "\"Pay at lesson\" option for club pros billed through their club",
            "Sell lesson packages and club fittings with your own pricing",
            "Sell gift cards",
            "Run a small shop for products",
          ]} />
          <Group title="Remote Lessons & Video Tools" items={[
            "Built-in video call for remote lessons",
            "Combined video call + Swing Sketch session page",
            "Swing Sketch - draw directly on a swing photo to illustrate technique",
            "Review player-submitted swing videos with timestamped comments",
            "Upload your own footage and attach it to a player's history",
            "Download any video; old ones clean up automatically after 90 days",
          ]} />
          <Group title="Customers & Notifications" items={[
            "Full customer list with search and golf profiles",
            "Push notifications for new bookings, video submissions, and low packages",
          ]} />
        </Section>

        <Section title="For Your Players">
          <Group title="Finding & Booking" items={[
            "Find a Pro - search by real distance or city",
            "Sign in with Google, or a password-free email link",
            "Book a lesson or club fitting online in a few taps",
            "Remote or in-person options",
            "Buy a lesson package or pay-as-you-go",
          ]} />
          <Group title="During & After Lessons" items={[
            "Join a remote lesson's video call directly from the app",
            "Submit swing videos for review",
            "Get feedback as timestamped comments",
            "Receive Swing Sketches",
            "View all upcoming sessions in one place",
          ]} />
          <Group title="Payments & Extras" items={[
            "Buy gift cards",
            "Shop your products",
            "Download their own swing videos",
            "Push notifications for confirmations, feedback, and low packages",
          ]} />
        </Section>

        <a href="/onboarding" style={{
          display: "block", textAlign: "center", background: "#1B3A2F", color: "#F6F4EE", borderRadius: 8,
          padding: "13px 20px", fontWeight: 700, fontSize: 14, textDecoration: "none", marginTop: 20,
        }}>
          Back to onboarding
        </a>
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 32 }}>
      <h2 style={{
        fontSize: 18, color: "#1B3A2F", borderBottom: "2px solid #B8862B", paddingBottom: 8, marginBottom: 16,
      }}>
        {title}
      </h2>
      {children}
    </div>
  );
}

function Group({ title, items }: { title: string; items: string[] }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: "#1B3A2F", marginBottom: 6 }}>{title}</div>
      <ul style={{ margin: 0, paddingLeft: 20 }}>
        {items.map((item, i) => (
          <li key={i} style={{ fontSize: 13.5, color: "#3A3A3A", marginBottom: 4, lineHeight: 1.4 }}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
