"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { SessionProvider } from "next-auth/react";
import { Capacitor } from "@capacitor/core";

export default function Providers({ children }: { children: React.ReactNode }) {
  // This runs once, regardless of which page the app happens to load into
  // first (login, the instructor dashboard, wherever a person's session
  // sends them) - hiding the splash only once this component has actually
  // mounted means it stays up through the real loading time, rather than
  // disappearing on a fixed timer that might reveal a still-blank page
  // underneath on a slower connection.
  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      import("@capacitor/splash-screen").then(({ SplashScreen }) => {
        SplashScreen.hide();
      });
    }
  }, []);

  return (
    <SessionProvider>
      <TabBarSync />
      {children}
    </SessionProvider>
  );
}

// The native app's own bottom tab bar lives entirely outside the website
// (real native Android UI, not a web page pretending to be one), which
// means the native side has no inherent way to know who's signed in or
// which business is currently active - that only ever exists in the
// website's own session. This is the piece that closes that gap: it
// watches the current page and session, and whenever either changes,
// tells the native layer (via the small bridge MainActivity exposes)
// which role's tab set to show and which business to navigate within.
function TabBarSync() {
  const pathname = usePathname();
  const { data: session, status } = useSession();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const bridge = (window as any).AndroidTabBar;
    if (!bridge) return;

    // Every business page follows /{slug}/whatever - pages outside that
    // pattern (the root domain, a future marketing page, etc.) don't have
    // a business context at all, so the tab bar has nothing to show.
    const slug = pathname?.split("/").filter(Boolean)[0];
    if (!slug || status !== "authenticated") {
      bridge.hide?.();
      return;
    }

    fetch(`/api/${slug}/my-role`)
      .then((r) => r.json())
      .then(({ role }) => {
        if (role) bridge.setRole?.(role, slug);
        else bridge.hide?.();
      })
      .catch(() => bridge.hide?.());
  }, [pathname, status, session]);

  return null;
}
