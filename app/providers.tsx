"use client";

import { useEffect } from "react";
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

  return <SessionProvider>{children}</SessionProvider>;
}
