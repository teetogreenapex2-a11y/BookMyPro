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
      <NativeAuthListener />
      {children}
    </SessionProvider>
  );
}

// Catches the Universal Link that brings a person back into the app
// after Apple sign-in finishes in the system browser (see the full
// explanation on the NativeAuthHandoff model in schema.prisma, and
// handleAppleSignIn in app/login/page.tsx, which is what sends them
// there in the first place). iOS hands the app the URL it was opened
// with via this same event whether the app was already running or is
// being cold-started by the link itself, so this needs to be mounted
// globally rather than on any one specific page.
function NativeAuthListener() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let removeListener: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      const { App } = await import("@capacitor/app");
      const handle = await App.addListener("appUrlOpen", async (event) => {
        const url = new URL(event.url);
        if (url.pathname !== "/native-auth-redeem") return;
        const token = url.searchParams.get("token");
        if (!token) return;

        try {
          const res = await fetch("https://bookmypro.app/api/auth/redeem-native-token", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token }),
          });
          const data = await res.json();
          // A full navigation (not client-side routing) so the freshly-set
          // session cookie is actually picked up by the next page's own
          // server-side session check, rather than relying on client-side
          // state that has no way to know a cookie just changed underneath it.
          window.location.href = res.ok ? (data.callbackUrl || "/") : "/login?error=native_signin_failed";
        } catch {
          window.location.href = "/login?error=native_signin_failed";
        }
      });
      if (cancelled) {
        handle.remove();
      } else {
        removeListener = () => handle.remove();
      }
    })();

    return () => {
      cancelled = true;
      removeListener?.();
    };
  }, []);

  return null;
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

  return null;
}
