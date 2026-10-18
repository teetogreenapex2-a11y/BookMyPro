// One place that defines every page reachable from the phone's bottom bar.
// The website sends the chosen tabs to the native bar (Android and iOS),
// so changing the lists below changes the app immediately, with no new
// app build. Anything not in the first four tabs shows in the "More" sheet.

export type NavItem = {
  key: string;
  label: string;
  icon: string; // key understood by the native bars and the web sheet
  path: string; // relative to /{slug}
};

const I = (key: string, label: string, icon: string, path: string): NavItem => ({ key, label, icon, path });

const STAFF_ALL: NavItem[] = [
  I("calendar", "Calendar", "calendar", "/instructor"),
  I("customers", "Customers", "customers", "/customers"),
  I("messages", "Messages", "messages", "/instructor/messages"),
  I("videos", "Videos", "videos", "/instructor/videos"),
  I("swingsketch", "Sketch", "sketch", "/instructor/swing-sketch"),
  I("shop", "Shop", "shop", "/instructor/shop"),
  I("staffmessages", "Team chat", "team", "/instructor/staff-messages"),
  I("giftcards", "Gift cards", "gift", "/gift-cards"),
  I("settings", "Settings", "settings", "/settings"),
];

const OWNER_ALL: NavItem[] = [
  ...STAFF_ALL.slice(0, 8),
  I("reports", "Reports", "reports", "/reports"),
  STAFF_ALL[8],
];

const PLAYER_ALL: NavItem[] = [
  I("book", "Book", "book", "/book"),
  I("videos", "Videos", "videos", "/videos"),
  I("messages", "Messages", "messages", "/messages"),
  I("swingsketch", "Sketch", "sketch", "/swing-sketches"),
  I("shop", "Shop", "shop", "/shop"),
  I("giftcards", "Gift cards", "gift", "/gift-cards"),
  I("settings", "Settings", "settings", "/settings"),
];

export const MAX_MAIN_TABS = 4;

export function navFor(role: string): { all: NavItem[]; main: NavItem[]; more: NavItem[] } | null {
  const all = role === "owner" ? OWNER_ALL : role === "instructor" ? STAFF_ALL : role === "player" ? PLAYER_ALL : null;
  if (!all) return null;
  return { all, main: all.slice(0, MAX_MAIN_TABS), more: all.slice(MAX_MAIN_TABS) };
}

// Which item the current page belongs to: the longest matching path wins,
// so /instructor/videos picks Videos rather than Calendar.
export function keyForPage(all: NavItem[], page: string): string {
  let best = "";
  let bestLen = -1;
  for (const it of all) {
    if ((page === it.path || page.startsWith(it.path + "/") || page.startsWith(it.path + "?")) && it.path.length > bestLen) {
      best = it.key;
      bestLen = it.path.length;
    }
  }
  return best;
}
