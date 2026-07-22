// Converts a "HH:MM" 24-hour string (the internal format used throughout
// the app for slot times) into a 12-hour display string like "8:00 AM" or
// "1:00 PM" - used purely for what's shown to the user; the underlying
// "HH:MM" value stays 24-hour everywhere else, since that's what gets
// parsed into actual Date objects.
export function formatTime12h(time24: string): string {
  const [h, m] = time24.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

// The timezone every business currently runs on. Hardcoded rather than
// stored per-business, since there's no timezone field on Business yet -
// a real scope decision, not an oversight. Every business using this app
// today is in the US Eastern timezone, so this is a reasonable v1
// simplification; a real multi-timezone rollout would need a stored
// business.timezone field and this constant replaced with that value
// everywhere it's used below.
export const BUSINESS_TIMEZONE = "America/New_York";

// Converts a wall-clock "HH:MM on a given calendar day" into the correct
// UTC Date instant for BUSINESS_TIMEZONE - correctly handling daylight
// saving time, which a fixed numeric offset would get wrong for half the
// year.
export function wallClockToUTC(dateOnly: Date, hours: number, minutes: number, timeZone: string = BUSINESS_TIMEZONE): Date {
  const year = dateOnly.getFullYear();
  const month = dateOnly.getMonth();
  const day = dateOnly.getDate();

  const guess = new Date(Date.UTC(year, month, day, hours, minutes, 0, 0));

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(formatter.formatToParts(guess).map((p) => [p.type, p.value]));
  const shownAsUTC = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour) === 24 ? 0 : Number(parts.hour), Number(parts.minute), Number(parts.second)
  );

  const diff = guess.getTime() - shownAsUTC;
  return new Date(guess.getTime() + diff);
}
