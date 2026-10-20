"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Capacitor } from "@capacitor/core";
import {
  CalendarDays, Users, Video, PencilRuler, Settings, BookOpen, MessageCircle,
  ShoppingBag, Gift, BarChart3, UsersRound, MoreHorizontal,
} from "lucide-react";
import { navFor, keyForPage, type NavItem } from "@/lib/navCatalog";

const ICONS: Record<string, any> = {
  calendar: CalendarDays, customers: Users, videos: Video, sketch: PencilRuler, settings: Settings,
  book: BookOpen, messages: MessageCircle, shop: ShoppingBag, gift: Gift, reports: BarChart3, team: UsersRound,
};

export const WEB_TAB_BAR_HEIGHT = 68;

// The same four-tabs-plus-More bar the phone app has, for people using the
// website on a phone-sized screen in a browser. (Inside the real app the
// native bar is used instead, so this stays out of the way there.) The More
// tab opens the same sheet the app uses.
export default function WebTabBar() {
  const pathname = usePathname();
  const router = useRouter();
  const { status } = useSession();
  const [narrow, setNarrow] = useState(false);
  const [main, setMain] = useState<NavItem[]>([]);
  const [all, setAll] = useState<NavItem[]>([]);
  const [slug, setSlug] = useState("");

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 820px)");
    const update = () => setNarrow(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const currentSlug = pathname?.split("/").filter(Boolean)[0] || "";

  useEffect(() => {
    if (Capacitor.isNativePlatform() || !narrow || status !== "authenticated" || !currentSlug) {
      setMain([]);
      return;
    }
    let cancelled = false;
    fetch(`/api/${currentSlug}/my-role`)
      .then((r) => r.json())
      .then(({ role }) => {
        if (cancelled) return;
        const nav = navFor(role);
        if (!nav) { setMain([]); return; }
        setSlug(currentSlug);
        setMain(nav.main);
        setAll(nav.all);
      })
      .catch(() => { if (!cancelled) setMain([]); });
    return () => { cancelled = true; };
  }, [narrow, status, currentSlug]);

  const visible = main.length > 0 && !Capacitor.isNativePlatform();

  // Tell the page the bar is showing (so it can drop its own top buttons)
  // and leave room at the bottom so the bar never covers content.
  useEffect(() => {
    (window as any).__bmpWebBar = visible;
    window.dispatchEvent(new CustomEvent("bmp-webbar", { detail: visible }));
    if (!visible) return;
    const prev = document.body.style.paddingBottom;
    document.body.style.paddingBottom = `${WEB_TAB_BAR_HEIGHT}px`;
    return () => { document.body.style.paddingBottom = prev; };
  }, [visible]);

  if (!visible) return null;

  const page = pathname?.replace(`/${slug}`, "") || "/";
  const k = keyForPage(all, page);
  const active = main.some((t) => t.key === k) ? k : "more";

  const tab = (key: string, label: string, Icon: any, onClick: () => void) => {
    const on = active === key;
    return (
      <button
        key={key}
        onClick={onClick}
        style={{
          flex: 1, border: 0, background: "transparent", display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", gap: 3, padding: "8px 2px",
          color: on ? "#fff" : "rgba(255,255,255,0.55)", fontSize: 11, fontWeight: on ? 700 : 500,
        }}
      >
        <Icon size={22} />
        <span>{label}</span>
      </button>
    );
  };

  return (
    <nav
      aria-label="Main"
      style={{
        position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 9000, display: "flex",
        height: WEB_TAB_BAR_HEIGHT, background: "#1B3A2F", borderTop: "1px solid rgba(255,255,255,0.12)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)", boxSizing: "content-box",
      }}
    >
      {main.map((t) => tab(t.key, t.label, ICONS[t.icon] || Settings, () => router.push(`/${slug}${t.path}`)))}
      {tab("more", "More", MoreHorizontal, () => window.dispatchEvent(new CustomEvent("bmp-open-more")))}
    </nav>
  );
}
