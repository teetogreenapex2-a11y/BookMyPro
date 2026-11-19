import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug } from "@/lib/tenant";
import { businessDestination } from "@/lib/businessUrl";
import { sendPushToMembership } from "@/lib/pushNotifications";

// Public side of the website chat. The chat bubble on teetogreenapex.com
// asks GET whether chat is switched on (and loads this visitor's messages),
// and POSTs each message the visitor sends. Only city/region is kept as
// location. Off by default; the owner flips it on the Chat page.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};
const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|headless|lighthouse|pagespeed|vercel|monitor|curl|wget|python|node-fetch/i;
const json = (data: any, status = 200) => NextResponse.json(data, { status, headers: { ...CORS, "Cache-Control": "no-store" } });
const clean = (v: string | null) => {
  if (!v) return "";
  try { return decodeURIComponent(v).slice(0, 60); } catch { return v.slice(0, 60); }
};
const cleanSid = (v: any) => String(v || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40);

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  try {
    const business = await getBusinessBySlug(params.slug);
    if (!business || !business.approved) return json({ enabled: false, messages: [] });
    const setting = await prisma.siteChatSetting.findUnique({ where: { businessId: business.id } });
    if (!setting?.enabled) return json({ enabled: false, messages: [] });
    const sid = cleanSid(req.nextUrl.searchParams.get("sid"));
    let messages: any[] = [];
    if (sid) {
      const chat = await prisma.siteChat.findUnique({
        where: { businessId_sessionId: { businessId: business.id, sessionId: sid } },
      });
      if (chat) {
        const rows = await prisma.siteChatMessage.findMany({
          where: { chatId: chat.id }, orderBy: { createdAt: "asc" }, take: 200,
        });
        messages = rows.map((m) => ({ id: m.id, fromOwner: m.fromOwner, text: m.text, at: m.createdAt }));
      }
    }
    return json({ enabled: true, messages });
  } catch (e) {
    console.error("Chat status failed:", e);
    return json({ enabled: false, messages: [] });
  }
}

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  try {
    if (BOT.test(req.headers.get("user-agent") || "")) return json({ error: "Not allowed" }, 403);
    const business = await getBusinessBySlug(params.slug);
    if (!business || !business.approved) return json({ error: "Not found" }, 404);
    const setting = await prisma.siteChatSetting.findUnique({ where: { businessId: business.id } });
    if (!setting?.enabled) return json({ error: "Chat is off right now." }, 403);

    let body: any = {};
    try { body = JSON.parse(await req.text()); } catch {}
    const sid = cleanSid(body?.sid);
    const text = String(body?.text || "").trim().slice(0, 600);
    const name = String(body?.name || "").trim().slice(0, 60);
    const contact = String(body?.contact || "").trim().slice(0, 80);
    if (!sid || !text) return json({ error: "Type a message first." }, 400);

    const city = clean(req.headers.get("x-vercel-ip-city"));
    const region = clean(req.headers.get("x-vercel-ip-country-region")) || clean(req.headers.get("x-vercel-ip-country"));

    let chat = await prisma.siteChat.findUnique({
      where: { businessId_sessionId: { businessId: business.id, sessionId: sid } },
    });
    if (!chat) {
      chat = await prisma.siteChat.create({
        data: { businessId: business.id, sessionId: sid, name, contact, city, region },
      }).catch(async () => prisma.siteChat.findUnique({ where: { businessId_sessionId: { businessId: business.id, sessionId: sid } } })) as any;
    }
    if (!chat) return json({ error: "Try again." }, 500);

    // Slow down spam: 6 per minute, 200 per chat.
    const recent = await prisma.siteChatMessage.count({
      where: { chatId: chat.id, fromOwner: false, createdAt: { gte: new Date(Date.now() - 60000) } },
    });
    const total = await prisma.siteChatMessage.count({ where: { chatId: chat.id, fromOwner: false } });
    if (recent >= 6 || total >= 200) return json({ error: "Slow down a little and try again." }, 429);

    const msg = await prisma.siteChatMessage.create({ data: { chatId: chat.id, fromOwner: false, text } });
    await prisma.siteChat.update({
      where: { id: chat.id },
      data: {
        ownerUnread: true, lastMessageAt: new Date(),
        ...(name ? { name } : {}), ...(contact ? { contact } : {}),
      },
    });

    const who = name || chat.name || [city, region].filter(Boolean).join(", ") || "A visitor";
    const owners = await prisma.membership.findMany({
      where: { businessId: business.id, role: "owner" }, select: { id: true },
    });
    for (const o of owners) {
      await sendPushToMembership(o.id, {
        title: "New chat message",
        body: `${who}: ${text.slice(0, 120)}`,
        url: businessDestination(business.slug, `/visitors?c=${chat.id}`),
      }).catch(() => {});
    }
    return json({ ok: true, message: { id: msg.id, fromOwner: false, text: msg.text, at: msg.createdAt } });
  } catch (e) {
    console.error("Chat send failed:", e);
    return json({ error: "Couldn't send. Please try again." }, 500);
  }
}
