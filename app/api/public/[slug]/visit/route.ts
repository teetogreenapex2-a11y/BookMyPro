import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug } from "@/lib/tenant";
import { businessDestination } from "@/lib/businessUrl";
import { sendPushToMembership } from "@/lib/pushNotifications";

// The business's own website (teetogreenapex.com) pings this when a real
// person opens a page. The owner gets a push like "Someone is on your
// website - Raleigh, NC", right away. Never for bots or well-known
// data-center locations, and only the visitor's city/state is used -
// nothing that identifies them.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};
// Cities that are almost entirely cloud data centers (scanners, crawlers,
// monitors), not people.
const DATA_CENTER_CITIES = new Set(["boardman", "the dalles", "ashburn", "council bluffs", "quincy", "moses lake", "san jose", "hillsboro", "de kalb", "lenoir", "forest city", "prineville"]);
const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|headless|lighthouse|pagespeed|vercel|monitor|curl|wget|python|node-fetch/i;

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
    try {
      const body = JSON.parse(await req.text());
      page = String(body?.page || "/").slice(0, 80);
      ref = String(body?.ref || "").slice(0, 80);
    } catch {}

    const city = clean(req.headers.get("x-vercel-ip-city"));
    const region = clean(req.headers.get("x-vercel-ip-country-region"));
    const country = clean(req.headers.get("x-vercel-ip-country"));
    if (DATA_CENTER_CITIES.has(city.toLowerCase())) return ok();
    const where = [city, region || country].filter(Boolean).join(", ") || "somewhere";
    let from = "";
    try { if (ref) from = ` · from ${new URL(ref).hostname.replace(/^www\./, "")}`; } catch {}

    const owners = await prisma.membership.findMany({
      where: { businessId: business.id, role: "owner" },
      select: { id: true },
    });
    for (const o of owners) {
      await sendPushToMembership(o.id, {
        title: "Someone is on your website",
        body: `${where} · ${page}${from}`,
        url: businessDestination(business.slug, "/instructor"),
      }).catch(() => {});
    }
  } catch (e) {
    console.error("Visit alert failed:", e);
  }
  return ok();
}
