"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Capacitor } from "@capacitor/core";
import {
  CalendarDays, Users, Video, PencilRuler, Settings, BookOpen, MessageCircle,
  ShoppingBag, Gift, BarChart3, UsersRound, Sparkles, MoreHorizontal,
} from "lucide-react";
import { navFor, keyForPage, type NavItem } from "@/lib/navCatalog";

const ICONS: Record<string, any> = {
  calendar: CalendarDays, customers: Users, videos: Video, sketch: PencilRuler, settings: Settings,
  book: BookOpen, messages: MessageCircle, shop: ShoppingBag, gift: Gift, reports: BarChart3, team: UsersRound, sparkle: Sparkles,
};

export const WEB_TAB_BAR_HEIGHT = 68;
export const WEB_TOP_BAR_HEIGHT = 52;

// The same four-tabs-plus-More bar the phone app has, for people using the
// website on a phone-sized screen in a browser. (Inside the real app the
// native bar is used instead, so this stays out of the way there.) The More
// tab opens the same sheet the app uses.
export default function WebTabBar() {
  const pathname = usePathname();
  const router = useRouter();
  const { status, data: sessionData } = useSession();
  const [narrow, setNarrow] = useState(false);
  const [wide, setWide] = useState(false);
  const [main, setMain] = useState<NavItem[]>([]);
  const [all, setAll] = useState<NavItem[]>([]);
  const [slug, setSlug] = useState("");

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 820px)");
    const update = () => { setNarrow(mq.matches); setWide(!mq.matches); };
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const currentSlug = pathname?.split("/").filter(Boolean)[0] || "";

  useEffect(() => {
    if (Capacitor.isNativePlatform() || (!narrow && !wide) || status !== "authenticated" || !currentSlug) {
      setMain([]);
      return;
    }
    let cancelled = false;
    fetch(`/api/${currentSlug}/my-role`)
      .then((r) => r.json())
      .then(({ role, videoEnabled, realRole }) => {
        if (cancelled) return;
        const nav = navFor(role, videoEnabled !== false, realRole);
        if (!nav) { setMain([]); return; }
        setSlug(currentSlug);
        setMain(nav.main);
        setAll(nav.all);
      })
      .catch(() => { if (!cancelled) setMain([]); });
    return () => { cancelled = true; };
  }, [narrow, wide, status, currentSlug]);

  const visible = main.length > 0 && !Capacitor.isNativePlatform();

  // Tell the page the bar is showing (so it can drop its own top buttons)
  // and leave room at the bottom so the bar never covers content.
  useEffect(() => {
    (window as any).__bmpWebBar = visible;
    window.dispatchEvent(new CustomEvent("bmp-webbar", { detail: visible }));
    if (!visible) return;
    if (wide) {
      const prevTop = document.body.style.paddingTop;
      document.body.style.paddingTop = `${WEB_TOP_BAR_HEIGHT}px`;
      return () => { document.body.style.paddingTop = prevTop; };
    }
    const prev = document.body.style.paddingBottom;
    document.body.style.paddingBottom = `${WEB_TAB_BAR_HEIGHT}px`;
    return () => { document.body.style.paddingBottom = prev; };
  }, [visible, wide]);

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

  if (wide) {
    const name = (sessionData?.user as any)?.name || "";
    const topItem = (key: string, label: string, Icon: any, onClick: () => void) => {
      const on = active === key;
      return (
        <button
          key={key}
          onClick={onClick}
          style={{
            border: 0, borderRadius: 8, display: "flex", alignItems: "center", gap: 8, padding: "8px 14px",
            background: on ? "rgba(255,255,255,0.16)" : "transparent",
            color: on ? "#fff" : "rgba(255,255,255,0.72)", fontSize: 14, fontWeight: on ? 700 : 500, cursor: "pointer",
          }}
        >
          <Icon size={18} />
          <span>{label}</span>
        </button>
      );
    };
    return (
      <nav
        aria-label="Main"
        style={{
          position: "fixed", left: 0, right: 0, top: 0, zIndex: 9000, display: "flex", alignItems: "center", gap: 4,
          height: WEB_TOP_BAR_HEIGHT, padding: "0 16px", background: "#1B3A2F", borderBottom: "1px solid rgba(255,255,255,0.12)",
          boxSizing: "border-box",
        }}
      >
        <span style={{ color: "#B8862B", fontWeight: 800, fontSize: 12, letterSpacing: "0.1em", marginRight: 14 }}>BOOKMYPRO</span>
        {main.map((t) => topItem(t.key, t.label, ICONS[t.icon] || Settings, () => router.push(`/${slug}${t.path}`)))}
        {topItem("more", "More", MoreHorizontal, () => window.dispatchEvent(new CustomEvent("bmp-open-more")))}
        <span style={{ marginLeft: "auto", color: "rgba(255,255,255,0.55)", fontSize: 12.5 }}>{name}</span>
      </nav>
    );
  }

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
