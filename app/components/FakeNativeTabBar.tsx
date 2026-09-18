"use client";

import { Calendar, Users, Video, PenLine, Settings, CalendarCheck } from "lucide-react";

// Stands in for the real native app's bottom tab bar, which is drawn
// entirely by the Android/iOS shell (see TabBarSync in app/providers.tsx)
// and so never appears in a plain browser. This is a plain web copy of it,
// shown only during a sandbox preview (see lib/sandboxPreview.ts), so
// someone trying BookMyPro before installing it gets a feel for the real
// app's navigation instead of the desktop-style header links.
//
// `activeKey` matches the same tab keys TabBarSync uses, so the highlighted
// tab here lines up with whatever the native app would highlight for the
// same page. There are two tab sets - an instructor previewing the
// dashboard sees the staff-side tabs, a player previewing the booking
// experience sees their own (see the two sandbox-link routes, which each
// point their invite link at the matching side).
export type TabKey = "calendar" | "customers" | "videos" | "swingsketch" | "settings" | "book";

const INSTRUCTOR_TABS: { key: TabKey; label: string; icon: typeof Calendar; href: (basePath: string) => string }[] = [
  { key: "calendar", label: "Calendar", icon: Calendar, href: (basePath) => `${basePath}/instructor` },
  { key: "customers", label: "Customers", icon: Users, href: (basePath) => `${basePath}/customers` },
  { key: "videos", label: "Videos", icon: Video, href: (basePath) => `${basePath}/instructor/videos` },
  { key: "swingsketch", label: "Sketch", icon: PenLine, href: (basePath) => `${basePath}/instructor/swing-sketch` },
  { key: "settings", label: "Settings", icon: Settings, href: (basePath) => `${basePath}/settings` },
];

const PLAYER_TABS: { key: TabKey; label: string; icon: typeof Calendar; href: (basePath: string) => string }[] = [
  { key: "book", label: "Book", icon: CalendarCheck, href: (basePath) => `${basePath}/book` },
  { key: "videos", label: "Videos", icon: Video, href: (basePath) => `${basePath}/videos` },
  { key: "swingsketch", label: "Sketch", icon: PenLine, href: (basePath) => `${basePath}/swing-sketches` },
  { key: "settings", label: "Settings", icon: Settings, href: (basePath) => `${basePath}/settings` },
];

// Matches the 76px of bottom padding pages already reserve for the real
// native tab bar (see the `isNative ? 76 : 0` pattern in these same pages),
// so page content clears the fake bar exactly the way it clears the real one.
export const FAKE_TAB_BAR_HEIGHT = 76;

export default function FakeNativeTabBar({ basePath, activeKey, role = "instructor" }: { basePath: string; activeKey: TabKey; role?: "instructor" | "player" }) {
  const TABS = role === "player" ? PLAYER_TABS : INSTRUCTOR_TABS;
  return (
    <nav
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        height: FAKE_TAB_BAR_HEIGHT,
        display: "flex",
        background: "var(--fairway)",
        borderTop: "1px solid rgba(255,255,255,0.12)",
        boxShadow: "0 -2px 12px rgba(0,0,0,0.25)",
        zIndex: 50,
      }}
    >
      {TABS.map(({ key, label, icon: Icon, href }) => {
        const active = key === activeKey;
        return (
          <a
            key={key}
            href={href(basePath)}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
              textDecoration: "none",
              color: active ? "var(--gold)" : "#9DB8A9",
            }}
          >
            <Icon size={22} strokeWidth={active ? 2.4 : 2} />
            <span style={{ fontSize: 10.5, fontWeight: active ? 700 : 600 }}>{label}</span>
          </a>
        );
      })}
    </nav>
  );
}
