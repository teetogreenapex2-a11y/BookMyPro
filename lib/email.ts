import { Resend } from "resend";
import { BUSINESS_TIMEZONE } from "./time";

// Built lazily (not at module load) so importing this file never crashes
// just because RESEND_API_KEY isn't set yet — notifications are optional,
// and a missing key should mean "skip silently," not "crash every booking."
let resend: Resend | null = null;
function getClient(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null;
  if (!resend) resend = new Resend(process.env.RESEND_API_KEY);
  return resend;
}

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "notifications@example.com";

async function sendEmail(to: string, subject: string, html: string) {
  const client = getClient();
  if (!client) {
    console.warn("RESEND_API_KEY is not set — skipping notification email.");
    return;
  }
  try {
    await client.emails.send({ from: FROM_EMAIL, to, subject, html });
  } catch (err) {
    // Never let a notification failure break the booking flow itself.
    console.error("Failed to send notification email:", err);
  }
}

type BookingAlertDetails = {
  businessName: string;
  serviceLabel: string; // e.g. "Lesson" or "Driver fitting"
  startTime: Date;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  priceCents: number;
  isPending: boolean; // true = needs approval, false = instantly confirmed
  reviewUrl?: string; // link to the instructor dashboard, only relevant when pending
};

// Sends the instructor a booking alert — called for both instant-confirmed
// bookings and pending requests (the wording just changes slightly), from
// every place a booking can be created: app/api/{slug}/bookings,
// app/api/stripe/webhook, app/api/square/webhook.
export async function sendBookingNotification(to: string | null | undefined, details: BookingAlertDetails) {
  if (!to) return; // no notification email configured — nothing to do

  const when = details.startTime.toLocaleString(undefined, {
    weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit",
    timeZone: BUSINESS_TIMEZONE,
  });
  const price = details.priceCents > 0 ? `$${(details.priceCents / 100).toFixed(0)}` : null;

  const subject = details.isPending
    ? `New request: ${details.serviceLabel} — ${when}`
    : `New booking: ${details.serviceLabel} — ${when}`;

  const html = `
    <div style="font-family: sans-serif; max-width: 480px;">
      <h2 style="margin-bottom: 4px;">${details.isPending ? "New booking request" : "New booking confirmed"}</h2>
      <p style="color: #5C6459; margin-top: 0;">${details.businessName}</p>
      <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
        <tr><td style="padding: 4px 0; color: #8A8571;">Service</td><td style="padding: 4px 0; font-weight: 600;">${details.serviceLabel}</td></tr>
        <tr><td style="padding: 4px 0; color: #8A8571;">When</td><td style="padding: 4px 0; font-weight: 600;">${when}</td></tr>
        <tr><td style="padding: 4px 0; color: #8A8571;">Player</td><td style="padding: 4px 0; font-weight: 600;">${details.contactName || "—"}</td></tr>
        <tr><td style="padding: 4px 0; color: #8A8571;">Phone</td><td style="padding: 4px 0;">${details.contactPhone || "—"}</td></tr>
        <tr><td style="padding: 4px 0; color: #8A8571;">Email</td><td style="padding: 4px 0;">${details.contactEmail || "—"}</td></tr>
        ${price ? `<tr><td style="padding: 4px 0; color: #8A8571;">Price</td><td style="padding: 4px 0; font-weight: 600;">${price}</td></tr>` : ""}
      </table>
      ${details.isPending
        ? `<p>This is held for the player but needs your confirmation.</p>
           ${details.reviewUrl ? `<a href="${details.reviewUrl}" style="display:inline-block;background:#1B3A2F;color:#F6F4EE;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600;">Review request</a>` : ""}`
        : `<p>This is already on your calendar — no action needed.</p>`
      }
    </div>
  `;

  await sendEmail(to, subject, html);
}

// Sent to the business owner when someone requests to join as an
// instructor - a real person, not automatically granted access, since
// unlike a player booking a lesson, becoming an instructor at someone
// else's business is a real trust decision that needs a human okay.
export async function sendInstructorRequestNotification(to: string | null | undefined, details: { businessName: string; applicantName: string; applicantEmail: string; applicantPhone: string; message: string; reviewUrl: string }) {
  if (!to) return;

  const html = `
    <div style="font-family: sans-serif; max-width: 480px;">
      <h2 style="margin-bottom: 4px;">New instructor request</h2>
      <p style="color: #5C6459; margin-top: 0;">${details.businessName}</p>
      <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
        <tr><td style="padding: 4px 0; color: #8A8571;">Name</td><td style="padding: 4px 0; font-weight: 600;">${details.applicantName}</td></tr>
        <tr><td style="padding: 4px 0; color: #8A8571;">Email</td><td style="padding: 4px 0;">${details.applicantEmail}</td></tr>
        <tr><td style="padding: 4px 0; color: #8A8571;">Phone</td><td style="padding: 4px 0;">${details.applicantPhone || "—"}</td></tr>
      </table>
      ${details.message ? `<p style="color: #5C6459;">"${details.message}"</p>` : ""}
      <p>They won't have any instructor access until you approve them.</p>
      <a href="${details.reviewUrl}" style="display:inline-block;background:#1B3A2F;color:#F6F4EE;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600;">Review request</a>
    </div>
  `;

  await sendEmail(to, `New instructor request: ${details.applicantName}`, html);
}

// Sent when someone finishes onboarding their own new business through
// /onboarding - it doesn't go live for real bookings until the platform
// admin reviews and approves it.
export async function sendNewBusinessNotification(to: string | null | undefined, details: { businessName: string; ownerName: string; ownerEmail: string; reviewUrl: string }) {
  if (!to) return;

  const html = `
    <div style="font-family: sans-serif; max-width: 480px;">
      <h2 style="margin-bottom: 4px;">New business awaiting approval</h2>
      <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
        <tr><td style="padding: 4px 0; color: #8A8571;">Business</td><td style="padding: 4px 0; font-weight: 600;">${details.businessName}</td></tr>
        <tr><td style="padding: 4px 0; color: #8A8571;">Owner</td><td style="padding: 4px 0; font-weight: 600;">${details.ownerName}</td></tr>
        <tr><td style="padding: 4px 0; color: #8A8571;">Email</td><td style="padding: 4px 0;">${details.ownerEmail}</td></tr>
      </table>
      <p>It won't accept real bookings until you approve it.</p>
      <a href="${details.reviewUrl}" style="display:inline-block;background:#1B3A2F;color:#F6F4EE;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600;">Review business</a>
    </div>
  `;

  await sendEmail(to, `New business awaiting approval: ${details.businessName}`, html);
}
export async function sendVideoReviewedNotification(to: string, details: { businessName: string; title: string | null }) {
  const subject = `Your swing video has feedback — ${details.businessName}`;
  const html = `
    <div style="font-family: sans-serif; max-width: 480px;">
      <h2 style="margin-bottom: 4px;">Your instructor left feedback</h2>
      <p style="color: #5C6459; margin-top: 0;">${details.businessName}</p>
      <p>${details.title ? `Your video "${details.title}"` : "The video you submitted"} now has comments from your instructor. Log in to take a look.</p>
    </div>
  `;
  await sendEmail(to, subject, html);
}

// Sent to whoever the gift card is for — the purchaser, if no recipient
// email was given, or the actual recipient if this was bought as a gift.
export async function sendGiftCardEmail(to: string, details: { businessName: string; code: string; amountCents: number; recipientName: string | null; message: string | null }) {
  const dollars = (details.amountCents / 100).toFixed(2);
  const subject = `Your ${details.businessName} gift card — $${dollars}`;
  const html = `
    <div style="font-family: sans-serif; max-width: 480px;">
      <h2 style="margin-bottom: 4px;">${details.recipientName ? `A gift for you, ${details.recipientName}` : "Your gift card"}</h2>
      <p style="color: #5C6459; margin-top: 0;">${details.businessName}</p>
      ${details.message ? `<p style="font-style: italic; padding: 12px; background: #F6F4EE; border-radius: 8px;">"${details.message}"</p>` : ""}
      <p>Value: <strong>$${dollars}</strong></p>
      <p>Code: <strong style="font-family: monospace; font-size: 16px;">${details.code}</strong></p>
      <p style="color: #5C6459; font-size: 13px;">Use this code at checkout for lessons, fittings, or the shop.</p>
    </div>
  `;
  await sendEmail(to, subject, html);
}

// Sends the actual magic link for passwordless sign-in - this is the
// custom sendVerificationRequest NextAuth's Email provider calls instead
// of its own default (which expects raw SMTP credentials we don't have,
// since everything else in this app already goes through Resend).
export async function sendMagicLinkEmail(to: string, url: string, businessName?: string) {
  const subject = businessName ? `Sign in to ${businessName}` : "Sign in to BookMyPro";
  const html = `
    <div style="font-family: sans-serif; max-width: 480px;">
      <h2 style="margin-bottom: 4px;">Sign in</h2>
      <p style="color: #5C6459; margin-top: 0;">Click below to sign in - this link works once and expires shortly for security.</p>
      <a href="${url}" style="display:inline-block;background:#1B3A2F;color:#F6F4EE;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600;margin-top:8px;">Sign in</a>
      <p style="color: #8A8571; font-size: 12px; margin-top: 20px;">If you didn't request this, you can safely ignore this email.</p>
    </div>
  `;
  await sendEmail(to, subject, html);
}
