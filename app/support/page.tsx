import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Support | BookMyPro",
};

const fairway = "#1B3A2F";
const chalk = "#F6F4EE";
const gold = "#B8862B";
const border = "#E5E0D0";

function Faq({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: fairway, marginBottom: 6 }}>{q}</div>
      <div style={{ fontSize: 14, lineHeight: 1.7, color: "#333" }}>{children}</div>
    </div>
  );
}

export default function SupportPage() {
  return (
    <div style={{ minHeight: "100vh", background: chalk, fontFamily: "sans-serif" }}>
      <header style={{ background: fairway, color: chalk, padding: "28px 20px" }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <img src="/logo.jpg" alt="" style={{ width: 36, height: 36, borderRadius: 8, objectFit: "cover", marginBottom: 8 }} />
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: gold, marginBottom: 10 }}>BOOKMYPRO</div>
          <h1 style={{ fontSize: 26, margin: "0 0 8px" }}>Support</h1>
          <p style={{ fontSize: 14, color: "#D7DED9", margin: 0 }}>
            Need help? Email us at <strong>support@bookmypro.app</strong> and we'll get back to you.
          </p>
        </div>
      </header>

      <main style={{ maxWidth: 720, margin: "0 auto", padding: "28px 20px 60px" }}>
        <div style={{ background: "#FCFBF7", border: `1px solid ${border}`, borderRadius: 12, padding: 24 }}>
          <Faq q="How do I book a lesson?">
            <p>
              Open your instructor's booking page (or use <a href="/find-a-pro" style={{ color: gold }}>Find a Pro</a> to
              search by city, state, zip, or your current location), pick a package or pay-as-you-go, and choose an
              open time on their calendar.
            </p>
          </Faq>

          <Faq q="I'm having trouble signing in">
            <p>
              BookMyPro supports signing in with Google, Apple, or a password-free email link - no password to
              forget. If a sign-in link email isn't arriving, check your spam folder, or try a different sign-in
              method. Still stuck? Email us at support@bookmypro.app with the email address you're using and we'll
              help sort it out.
            </p>
          </Faq>

          <Faq q="How do I message my instructor?">
            <p>Go to Messages in the app - your conversation is created automatically the first time you open it.</p>
          </Faq>

          <Faq q="How do I delete my account?">
            <p>
              See our <a href="/account-deletion" style={{ color: gold }}>account deletion page</a> for the full
              steps.
            </p>
          </Faq>

          <Faq q="Something's not working right">
            <p>
              Email us at support@bookmypro.app with what you were trying to do and what happened instead - screenshots
              help a lot if you can include one. We'll get back to you as soon as we can.
            </p>
          </Faq>
        </div>
      </main>
    </div>
  );
}
