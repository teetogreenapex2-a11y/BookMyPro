// The "What's new" list. Newest first. To announce something, add an entry
// at the TOP with a new unique id - the banner and the dot on More light up
// for everyone who hasn't seen it yet.
// audience: "all" | "staff" (owners and instructors) | "player"

export type ChangeEntry = { id: string; date: string; title: string; text: string; audience: "all" | "staff" | "player" };

export const CHANGELOG: ChangeEntry[] = [
  {
    id: "2026-11-11-email",
    date: "Nov 11, 2026",
    title: "Email one customer, and nicer emails",
    text: "Every customer card now has an Email button to send a real email to just that person. Emails now show your business name as the sender, replies come back to you, paragraphs are spaced out and links are tappable.",
    audience: "staff",
  },
  {
    id: "2026-11-10-pay-alerts",
    date: "Nov 10, 2026",
    title: "Payment alerts and receipts",
    text: "You now get an email and a notification whenever a card payment comes in, and customers get a receipt right away. Lesson, class, fitting, shop and raffle payments are all confirmed automatically, even if a customer closes the page early.",
    audience: "staff",
  },
  {
    id: "2026-11-10-receipts",
    date: "Nov 10, 2026",
    title: "Payment confirmation",
    text: "After you pay, you now see a clear \"Payment received\" message and get a receipt by email, so you never have to wonder whether it went through.",
    audience: "player",
  },
  {
    id: "2026-11-10-raffle-200",
    date: "Nov 10, 2026",
    title: "New 200/20 raffle",
    text: "A second raffle is open: 20 spots at $200 each, with a full bag, a set of irons and a Ping G450 driver up for grabs. Everyone else gets a $200 gift card. Pledge a spot now - your card is only charged when all 20 spots are filled. Owners can switch between both raffles at the top of the Raffle page.",
    audience: "all",
  },
  {
    id: "2026-11-05-raffle",
    date: "Nov 5, 2026",
    title: "Raffle: pick up to 3 spaces at once",
    text: "The 50/50 raffle now lets you claim up to 3 spaces in one go and pay by card or Venmo. The sign-up box no longer gets covered by the keyboard or the tab bar.",
    audience: "all",
  },
  {
    id: "2026-11-03-personal",
    date: "Nov 3, 2026",
    title: "BookMyPro Personal",
    text: "Use BookMyPro on your own to keep your swing videos, see your tempo and key positions, and keep a club journal. Try it free for 7 days, no card needed. You can also send a swing to any instructor on BookMyPro for review.",
    audience: "player",
  },
  {
    id: "2026-11-03-view-switch",
    date: "Nov 3, 2026",
    title: "Switch between Instructor view and Player view",
    text: "If you're an instructor and also a student, tap More and choose Player view (or Instructor view) to flip between the two with the same email.",
    audience: "staff",
  },
  {
    id: "2026-11-02-customers",
    date: "Nov 2, 2026",
    title: "Better customer filters",
    text: "On the Customers page you can now filter by where someone came from: Signed up, Imported, Added by hand, or From BookMyPro. Android video downloads also work now.",
    audience: "staff",
  },
];

export function audienceFor(role: string | null | undefined): "staff" | "player" {
  return role === "owner" || role === "instructor" ? "staff" : "player";
}

export function entriesFor(role: string | null | undefined): ChangeEntry[] {
  const a = audienceFor(role);
  return CHANGELOG.filter((e) => e.audience === "all" || e.audience === a);
}

export function latestIdFor(role: string | null | undefined): string | null {
  return entriesFor(role)[0]?.id ?? null;
}

export const SEEN_KEY = "bmp-whatsnew-seen";

export function readSeen(): string | null {
  try { return localStorage.getItem(SEEN_KEY); } catch { return null; }
}
export function markSeen(id: string | null) {
  try { if (id) localStorage.setItem(SEEN_KEY, id); } catch {}
}
// Unseen = the newest entry for this person isn't the one they last opened.
export function hasUnseen(role: string | null | undefined): boolean {
  const latest = latestIdFor(role);
  if (!latest) return false;
  return readSeen() !== latest;
}
