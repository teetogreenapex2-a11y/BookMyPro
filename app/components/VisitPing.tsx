"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { Capacitor } from "@capacitor/core";

// Lets the owner know when someone who ISN'T signed in opens one of the
// business's public pages (booking, shop, gift cards, raffle). Signed-in
// people - the owner, staff and customers - never count. The first ping of
// a visit sends the alert; a heartbeat every 15 seconds while the tab is open
// feeds the owner's Visitors page (pages visited, time on each). Never inside
// the native app, and a device opened once with ?noalert=1 is skipped for good.
const PUBLIC_PAGE = /^\/([a-z0-9-]+)\/(book|shop|gift-cards|raffle)(\/|$)/i;

export default function VisitPing() {
  const pathname = usePathname();
  const { status } = useSession();
  const current = useRef<{ slug: string; page: string } | null>(null);

  useEffect(() => {
    if (status !== "unauthenticated" || !pathname) { current.current = null; return; }
    if (Capacitor.isNativePlatform()) return;
    const m = pathname.match(PUBLIC_PAGE);
    if (!m) { current.current = null; return; }
    try {
      if (/[?&]noalert=1/.test(window.location.search)) localStorage.setItem("bmp_noalert", "1");
      if (localStorage.getItem("bmp_noalert")) return;
      const slug = m[1];
      current.current = { slug, page: `BookMyPro ${pathname.slice(slug.length + 1)}` };
      send();
    } catch {}
  }, [status, pathname]);

  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === "visible") send(); }, 15000);
    const onVis = () => { if (document.visibilityState === "visible") send(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onVis); };
  }, []);

  function send() {
    const c = current.current;
    if (!c) return;
    try {
      const key = `bmp_sid_${c.slug}`;
      let sid = sessionStorage.getItem(key);
      if (!sid) {
        sid = Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
        sessionStorage.setItem(key, sid);
      }
      const body = JSON.stringify({ sid, page: c.page, ref: document.referrer, source: "bookmypro" });
      const url = `/api/public/${c.slug}/visit`;
      if (navigator.sendBeacon) navigator.sendBeacon(url, body);
      else fetch(url, { method: "POST", body, keepalive: true });
    } catch {}
  }

  return null;
}
