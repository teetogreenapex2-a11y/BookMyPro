import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy | BookMyPro",
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

export default function PrivacyPolicyPage() {
  return (
    <div style={{ minHeight: "100vh", background: chalk, fontFamily: "sans-serif" }}>
      <header style={{ background: fairway, color: chalk, padding: "28px 20px" }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <img src="/logo.jpg" alt="" style={{ width: 36, height: 36, borderRadius: 8, objectFit: "cover", marginBottom: 8 }} />
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: gold, marginBottom: 10 }}>BOOKMYPRO</div>
          <h1 style={{ fontSize: 26, margin: "0 0 8px" }}>Privacy Policy</h1>
          <p style={{ fontSize: 13, color: "#D7DED9", margin: 0 }}>Last updated August 26, 2026</p>
        </div>
      </header>

      <main style={{ maxWidth: 720, margin: "0 auto", padding: "28px 20px 60px" }}>
        <div style={{ background: "#FCFBF7", border: `1px solid ${border}`, borderRadius: 12, padding: 24 }}>
          <Section title="Who we are">
            <p>
              BookMyPro ("BookMyPro," "we," "us") is a booking and lesson management platform for golf
              instructors and their students, operated under the Tee to Green Golf business name. This policy
              covers the BookMyPro website (bookmypro.app) and mobile apps.
            </p>
          </Section>

          <Section title="Information we collect">
            <p>We collect the information needed to run bookings, payments, and instructor tools:</p>
            <ul style={{ margin: "8px 0", paddingLeft: 20 }}>
              <li>Account info: name, email, and profile photo when you sign up or sign in</li>
              <li>Booking info: lessons booked, package purchases, scheduling details</li>
              <li>Payment info: handled directly by our payment processors (Stripe or Square) - BookMyPro does not store your card details</li>
              <li>Video and swing sketch uploads submitted for instructor review</li>
              <li>Calendar data, only if you connect Google Calendar or Outlook (see below)</li>
            </ul>
          </Section>

          <Section title="How we use Google Calendar data">
            <p>
              Instructors may optionally connect their Google Calendar to keep their availability in sync.
              With this connection, BookMyPro:
            </p>
            <ul style={{ margin: "8px 0", paddingLeft: 20 }}>
              <li>Creates a calendar event automatically when a lesson is booked through BookMyPro</li>
              <li>Removes that event if the lesson is canceled</li>
              <li>Reads your existing calendar events, only to detect time conflicts, so BookMyPro doesn't offer a slot you're already busy during</li>
            </ul>
            <p>
              BookMyPro only requests access to calendar events (not your full Google Account) and only uses
              this access for the scheduling purposes described above. We do not read, use, or share the
              content of your other calendar events for advertising or any purpose unrelated to scheduling.
              You can disconnect Google Calendar at any time from Settings, which immediately revokes this
              access.
            </p>
            <p>
              BookMyPro's use and transfer of information received from Google APIs adheres to the{" "}
              <a href="https://developers.google.com/terms/api-services-user-data-policy" style={{ color: fairway }}>
                Google API Services User Data Policy
              </a>
              , including the Limited Use requirements.
            </p>
          </Section>

          <Section title="How we share information">
            <p>
              We don't sell your personal information. We share information only as needed to run the
              service: with your instructor or player for the purposes of a booking, with payment processors
              to complete a transaction, and with service providers (like our hosting and email providers)
              who help us operate BookMyPro under agreements that limit their use of your data.
            </p>
          </Section>

          <Section title="How we protect your data">
            <p>
              Security procedures are in place to protect the confidentiality of your data, including data
              accessed through Google APIs:
            </p>
            <ul style={{ margin: "8px 0", paddingLeft: 20 }}>
              <li>All data is encrypted in transit using HTTPS/TLS, both between your device and BookMyPro and between BookMyPro and Google's APIs</li>
              <li>Data is encrypted at rest in our database provider's infrastructure</li>
              <li>Access to your account and data requires authentication, and is limited by role - a player only sees their own bookings and information, while instructor and owner access is limited to their own business</li>
              <li>Google access tokens are stored securely and are never shared with any third party or used for any purpose beyond the scheduling features described above</li>
              <li>You can revoke BookMyPro's access to your Google Calendar at any time from Settings, or directly from your Google Account's security settings</li>
            </ul>
          </Section>

          <Section title="Data retention">
            <p>
              We retain account and booking information for as long as your account is active, or as needed
              to provide the service, comply with legal obligations, and resolve disputes. You can request
              deletion of your account and associated data at any time by contacting us below.
            </p>
          </Section>

          <Section title="Your choices">
            <p>
              You can update your account information, disconnect Google Calendar or Outlook, and manage
              notification preferences from Settings within the app. To request a copy of your data or full
              account deletion, contact us using the information below.
            </p>
          </Section>

          <Section title="Contact us">
            <p>
              Questions about this policy or your data can be sent to{" "}
              <a href="mailto:support@bookmypro.app" style={{ color: fairway }}>support@bookmypro.app</a>.
            </p>
          </Section>
        </div>
      </main>
    </div>
  );
}
