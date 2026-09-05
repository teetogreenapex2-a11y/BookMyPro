"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Capacitor } from "@capacitor/core";

// Renders nothing itself - just checks, right after the marketing page
// mounts, whether it's actually running inside the native app rather
// than a regular browser. If so, it redirects straight to /login
// immediately, since a generic sales pitch makes no sense for someone
// who has already downloaded and opened the real app - they just need
// to sign in. Left as a separate small component (rather than making
// the whole marketing page a client component) since Capacitor's own
// answer to this question isn't reliable from the server at all.
export default function NativeMarketingRedirect() {
  const router = useRouter();

  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      router.replace("/login");
    }
  }, [router]);

  return null;
}
