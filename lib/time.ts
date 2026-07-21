// Converts a "HH:MM" 24-hour string (the internal format used throughout
// the app for slot times) into a 12-hour display string like "8:00 AM" or
// "1:00 PM" — used purely for what's shown to the user; the underlying
// "HH:MM" value stays 24-hour everywhere else, since that's what gets
// parsed into actual Date objects.
export function formatTime12h(time24: string): string {
  const [h, m] = time24.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}
