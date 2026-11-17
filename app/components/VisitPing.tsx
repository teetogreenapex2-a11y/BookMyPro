"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { Capacitor } from "@capacitor/core";

// Lets the owner know when someone who ISN'T signed in opens one of the
// business's public pages (booking, shop, gift cards, raffle). Signed-in
// people - the owner, staff and customers - never trigger an alert. Once per
// visit per business, never inside the native app, and a device opened once
// with ?noalert=1 is skipped for good.
const PUBLIC_PAGE = /^\/([a-z0-9-]+)\/(book|shop|gift-cards|raffle)(\/|$)/i;

export default function VisitPing() {
  const pathname = usePathname();
  const { status } = useSession();

  useEffect(() => {
    if (status !== "unauthenticated" || !pathname) return;
    if (Capacitor.isNativePlatform()) return;
    const m = pathname.match(PUBLIC_PAGE);
    if (!m) return;
    try {
      if (/[?&]noalert=1/.test(window.location.search)) localStorage.setItem("bmp_noalert", "1");
      if (localStorage.getItem("bmp_noalert")) return;
      const slug = m[1];
      const key = `bmp_pinged_${slug}`;
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
      const page = `BookMyPro ${pathname.slice(slug.length + 1)}`;
      const body = JSON.stringify({ page, ref: document.referrer });
      const url = `/api/public/${slug}/visit`;
      if (navigator.sendBeacon) navigator.sendBeacon(url, body);
      else fetch(url, { method: "POST", body, keepalive: true });
    } catch {}
  }, [status, pathname]);

  return null;
}
