import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug, getMembership } from "@/lib/tenant";
import { businessDestination } from "@/lib/businessUrl";
import { sendPushToMembership } from "@/lib/pushNotifications";

// The business's own website (teetogreenapex.com) and the public BookMyPro
// pages ping this while a real person is on them. The first ping of a visit
// sends the owner a push ("Someone is on your website - Raleigh, NC"); every
// ping (a "heartbeat" about every 15 seconds) is recorded so the owner can see
// the pages each visitor went through and how long they stayed on each.
// Never for bots or well-known data-center locations, and only the visitor's
// city/state is kept - nothing that identifies them.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};
const DATA_CENTER_CITIES = new Set(["boardman", "the dalles", "ashburn", "council bluffs", "quincy", "moses lake", "san jose", "hillsboro", "de kalb", "lenoir", "forest city", "prineville"]);
const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|headless|lighthouse|pagespeed|vercel|monitor|curl|wget|python|node-fetch/i;
const MAX_PAGES = 40;

type VisitPage = { path: string; at: string; lastAt: string };

const clean = (v: string | null) => {
  if (!v) return "";
  try { return decodeURIComponent(v).slice(0, 60); } catch { return v.slice(0, 60); }
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const ok = () => new NextResponse(null, { status: 204, headers: CORS });
  try {
    if (BOT.test(req.headers.get("user-agent") || "")) return ok();

    const business = await getBusinessBySlug(params.slug);
    if (!business || !business.approved) return ok();

    let page = "/";
    let ref = "";
    let sid = "";
    let source = "website";
    try {
      const body = JSON.parse(await req.text());
      page = String(body?.page || "/").slice(0, 80);
      ref = String(body?.ref || "").slice(0, 120);
      sid = String(body?.sid || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40);
      if (body?.source === "bookmypro") source = "bookmypro";
    } catch {}

    // Signed in? Customers, staff and owners are never tracked. Someone who has
    // an account but is not (yet) a customer of this business is - that is the
    // person worth a follow-up.
    let who = { userId: "", name: "", email: "" };
    const session = await getServerSession(authOptions);
    const uid = (session?.user as any)?.id as string | undefined;
    if (uid) {
      const m = await getMembership(uid, business.id);
      if (m && m.status === "active") return ok();
      who = { userId: uid, name: String(session?.user?.name || "").slice(0, 80), email: String(session?.user?.email || "").slice(0, 120) };
    }

    const city = clean(req.headers.get("x-vercel-ip-city"));
    const region = clean(req.headers.get("x-vercel-ip-country-region"));
    const country = clean(req.headers.get("x-vercel-ip-country"));
    if (DATA_CENTER_CITIES.has(city.toLowerCase())) return ok();

    const now = new Date();
    let isNew = true;

    if (sid) {
      const existing = await prisma.siteVisit.findUnique({
        where: { businessId_sessionId: { businessId: business.id, sessionId: sid } },
      });
      if (existing) {
        isNew = false;
        const pages = (Array.isArray(existing.pages) ? existing.pages : []) as VisitPage[];
        const last = pages[pages.length - 1];
        if (last && last.path === page) last.lastAt = now.toISOString();
        else pages.push({ path: page, at: now.toISOString(), lastAt: now.toISOString() });
        await prisma.siteVisit.update({
          where: { id: existing.id },
          data: { pages: pages.slice(-MAX_PAGES) as any, lastSeenAt: now },
        });
      } else {
        await prisma.siteVisit.create({
          data: {
            businessId: business.id, sessionId: sid, source, city, region, country, referrer: ref,
            userId: who.userId, visitorName: who.name, visitorEmail: who.email,
            pages: [{ path: page, at: now.toISOString(), lastAt: now.toISOString() }] as any,
          },
        }).catch(() => { isNew = false; }); // two first pings raced - the other one alerts
      }
    }

    // Tidy up: keep 60 days of history.
    if (isNew && Math.random() < 0.05) {
      await prisma.siteVisit.deleteMany({
        where: { businessId: business.id, lastSeenAt: { lt: new Date(Date.now() - 60 * 86400000) } },
      }).catch(() => {});
    }

    if (!isNew) return ok();

    const where = [city, region || country].filter(Boolean).join(", ") || "somewhere";
    let from = "";
    try { if (ref) from = ` · from ${new URL(ref).hostname.replace(/^www\./, "")}`; } catch {}

    const owners = await prisma.membership.findMany({
      where: { businessId: business.id, role: "owner" },
      select: { id: true },
    });
    for (const o of owners) {
      await sendPushToMembership(o.id, {
        title: who.userId ? "An account holder is browsing" : "Someone is on your website",
        body: who.userId
          ? `${who.name || who.email} (has an account, not a customer yet) · ${where} · ${page}`
          : `${where} · ${page}${from}`,
        url: businessDestination(business.slug, "/visitors"),
      }).catch(() => {});
    }
  } catch (e) {
    console.error("Visit alert failed:", e);
  }
  return ok();
}
