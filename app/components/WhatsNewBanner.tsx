"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Sparkles, X } from "lucide-react";
import { entriesFor, latestIdFor, markSeen, readSeen } from "@/lib/changelog";

// A small, dismissible "What's new" banner on the home screens (Calendar for
// instructors, Book for players), shown once per update.
export default function WhatsNewBanner() {
  const pathname = usePathname();
  const router = useRouter();
  const { status } = useSession();
  const [info, setInfo] = useState<{ slug: string; title: string; id: string } | null>(null);

  useEffect(() => {
    setInfo(null);
    const parts = (pathname || "").split("/").filter(Boolean);
    const slug = parts[0];
    const home = parts.length === 2 && (parts[1] === "instructor" || parts[1] === "book");
    if (!slug || !home || status !== "authenticated") return;
    let cancelled = false;
    fetch(`/api/${slug}/my-role`)
      .then((r) => r.json())
      .then(({ role }) => {
        if (cancelled || !role) return;
        const latest = latestIdFor(role);
        if (!latest) return;
        const seen = readSeen();
        if (seen === latest) return;
        setInfo({ slug, title: entriesFor(role)[0].title, id: latest });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [pathname, status]);

  if (!info) return null;
  return (
    <div
      style={{
        position: "fixed", left: 12, right: 12, top: "calc(env(safe-area-inset-top, 0px) + 10px)", zIndex: 9500,
        maxWidth: 520, margin: "0 auto", background: "#1B3A2F", color: "#F6F4EE", borderRadius: 14,
        padding: "10px 12px", display: "flex", alignItems: "center", gap: 10, boxShadow: "0 6px 22px rgba(0,0,0,0.25)",
      }}
    >
      <Sparkles size={20} color="#E3C16F" style={{ flexShrink: 0 }} />
      <button
        onClick={() => { markSeen(info.id); router.push(`/${info.slug}/whats-new`); }}
        style={{ flex: 1, textAlign: "left", background: "none", border: 0, color: "inherit", padding: 0, fontSize: 13.5, lineHeight: 1.35 }}
      >
        <strong>What's new:</strong> {info.title} <span style={{ textDecoration: "underline" }}>See what's new</span>
      </button>
      <button onClick={() => { markSeen(info.id); setInfo(null); }} aria-label="Dismiss" style={{ background: "none", border: 0, padding: 4 }}>
        <X size={18} color="#F6F4EE" />
      </button>
    </div>
  );
}
