"use client";

import { useEffect, useState } from "react";
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
  const { status } = useSession();
  // Temporary, visible debug indicator - shows directly on the page
  // whether the native iOS bridge actually got injected at all, since
  // there's no easy way to check Xcode's own console without a Mac.
  // Safe to remove once this is sorted out.
  const [bridgeStatus, setBridgeStatus] = useState("checking...");

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const bridge = (window as any).AndroidTabBar;
    setBridgeStatus(bridge ? "bridge FOUND" : "bridge MISSING");
    if (!bridge) return;

    // Every business page follows /{slug}/whatever - pages outside that
    // pattern (the root domain, a future marketing page, etc.) don't have
    // a business context at all, so the tab bar has nothing to show.
    const slug = pathname?.split("/").filter(Boolean)[0];
    if (!slug || status !== "authenticated") {
      bridge.hide?.();
      return;
    }

    // Which tab should be shown as highlighted for the current page -
    // without this, the tab bar's selection only ever updated when
    // someone actually tapped a tab directly, so navigating some other
    // way (a "\u2190 Back" link, the system back button) left it showing
    // whichever tab was tapped last, rather than the page actually on
    // screen.
    const page = pathname?.replace(`/${slug}`, "") || "/";
    const pageKey = page.startsWith("/instructor/videos") ? "videos"
      : page.startsWith("/instructor/swing-sketch") ? "swingsketch"
      : page.startsWith("/instructor") ? "calendar"
      : page.startsWith("/customers") ? "customers"
      : page.startsWith("/videos") ? "videos"
      : page.startsWith("/swing-sketches") ? "swingsketch"
      : page.startsWith("/settings") ? "settings"
      : page.startsWith("/book") ? "book"
      : "";

    fetch(`/api/${slug}/my-role`)
      .then((r) => r.json())
      .then(({ role }) => {
        if (role) bridge.setRole?.(role, slug, pageKey);
        else bridge.hide?.();
      })
      .catch(() => bridge.hide?.());
  }, [pathname, status]);

  if (!Capacitor.isNativePlatform()) return null;
  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 999999, background: "red", color: "white", fontSize: 18, fontWeight: 900, padding: "12px", textAlign: "center" }}>
      DEBUG: {bridgeStatus}
    </div>
  );
}
