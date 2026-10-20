"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Capacitor } from "@capacitor/core";
import {
  CalendarDays, Users, Video, PencilRuler, Settings, BookOpen, MessageCircle,
  ShoppingBag, Gift, BarChart3, UsersRound, X,
} from "lucide-react";
import { navFor, type NavItem } from "@/lib/navCatalog";

const ICONS: Record<string, any> = {
  calendar: CalendarDays, customers: Users, videos: Video, sketch: PencilRuler, settings: Settings,
  book: BookOpen, messages: MessageCircle, shop: ShoppingBag, gift: Gift, reports: BarChart3, team: UsersRound,
};

// The bottom sheet that opens when someone taps "More" on the phone's native
// bar. The native bar fires a "bmp-open-more" event into the page; this
// shows every page that didn't fit in the four main tabs as big icons.
export default function NativeMoreSheet() {
  const pathname = usePathname();
  const router = useRouter();
  const { status } = useSession();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NavItem[]>([]);
  const [slug, setSlug] = useState("");

  const currentSlug = pathname?.split("/").filter(Boolean)[0] || "";

  useEffect(() => { setOpen(false); }, [pathname]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const onOpen = async () => {
      if (!currentSlug || status !== "authenticated") return;
      try {
        const { role } = await (await fetch(`/api/${currentSlug}/my-role`)).json();
        const nav = navFor(role);
        if (!nav) return;
        setSlug(currentSlug);
        setItems(nav.more);
        setOpen(true);
      } catch {}
    };
    window.addEventListener("bmp-open-more", onOpen);
    return () => window.removeEventListener("bmp-open-more", onOpen);
  }, [currentSlug, status]);

  if (!open) return null;
  // On iPhone the native bar floats over the page, so lift the sheet above it.
  const bottomPad = Capacitor.getPlatform() === "ios" ? 96 : 0;

  return (
    <div
      onClick={() => setOpen(false)}
      style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.25)", display: "flex", alignItems: "flex-end" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", background: "rgba(27,58,47,0.58)", WebkitBackdropFilter: "blur(22px) saturate(1.5)", backdropFilter: "blur(22px) saturate(1.5)", borderTop: "1px solid rgba(255,255,255,0.28)", borderRadius: "20px 20px 0 0", padding: `16px 16px ${16 + bottomPad}px`, boxShadow: "0 -8px 30px rgba(0,0,0,0.2)" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 17, color: "#F6F4EE" }}>More</div>
          <button onClick={() => setOpen(false)} aria-label="Close" style={{ border: 0, background: "transparent", padding: 6 }}>
            <X size={22} color="#F6F4EE" />
          </button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          {items.map((it) => {
            const Icon = ICONS[it.icon] || Settings;
            return (
              <button
                key={it.key}
                onClick={() => { setOpen(false); router.push(`/${slug}${it.path}`); }}
                style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "16px 6px", border: "1px solid rgba(255,255,255,0.22)", borderRadius: 16, background: "rgba(255,255,255,0.12)", color: "#F6F4EE", fontSize: 13, fontWeight: 600 }}
              >
                <Icon size={30} />
                <span>{it.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
