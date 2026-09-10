import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Delete Your Account | BookMyPro",
};

const fairway = "#1B3A2F";
const chalk = "#F6F4EE";
const gold = "#B8862B";
const border = "#E5E0D0";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 32 }}>
      <h2 style={{ fontSize: 18, color: fairway, margin: "0 0 10px" }}>{title}</h2>
      <div style={{ fontSize: 14, lineHeight: 1.7, color: "#333" }}>{children}</div>
    </section>
  );
}

export default function AccountDeletionPage() {
  return (
    <div style={{ minHeight: "100vh", background: chalk, fontFamily: "sans-serif" }}>
      <header style={{ background: fairway, color: chalk, padding: "28px 20px" }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <img src="/logo.jpg" alt="" style={{ width: 36, height: 36, borderRadius: 8, objectFit: "cover", marginBottom: 8 }} />
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: gold, marginBottom: 10 }}>BOOKMYPRO</div>
          <h1 style={{ fontSize: 26, margin: "0 0 8px" }}>Delete Your Account</h1>
        </div>
      </header>

      <main style={{ maxWidth: 720, margin: "0 auto", padding: "28px 20px 60px" }}>
        <div style={{ background: "#FCFBF7", border: `1px solid ${border}`, borderRadius: 12, padding: 24 }}>
          <Section title="If you still have access to your account">
            <p>
              Sign in to BookMyPro (on the web or in the app), go to <strong>Settings</strong>, and scroll to the
              bottom for <strong>"Delete my account."</strong> This permanently removes your account and personal
              information right away - there's no waiting period.
            </p>
          </Section>

          <Section title="If you no longer have access">
            <p>
              If you've uninstalled the app, can't sign in, or would rather not log back in just to delete your
              account, email <strong>support@bookmypro.app</strong> from the email address on your account and ask
              us to delete it. We'll confirm the request and remove your data within a few business days.
            </p>
          </Section>

          <Section title="What gets deleted">
            <p>
              Your name, email, phone number, messages, and any swing videos you've submitted are permanently
              removed. Booking and payment records tied to a completed transaction may be retained for a limited
              time as required for financial recordkeeping and tax purposes, but are no longer linked to an active
              account of yours.
            </p>
          </Section>
        </div>
      </main>
    </div>
  );
}