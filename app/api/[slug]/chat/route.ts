import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug, getMembership } from "@/lib/tenant";

// Owner side of the website chat.
//   GET  /api/{slug}/chat            -> { enabled, chats: [...] }
//   GET  /api/{slug}/chat?id=...     -> one chat's messages (marks it read)
//   POST /api/{slug}/chat {id,text}  -> reply to a visitor
//   PATCH /api/{slug}/chat {enabled} -> turn the chat bubble on or off
async function owner(slug: string) {
  const session = await getServerSession(authOptions);
  if (!session) return { error: NextResponse.json({ error: "Sign in required" }, { status: 401 }) };
  const business = await getBusinessBySlug(slug);
  if (!business) return { error: NextResponse.json({ error: "Business not found" }, { status: 404 }) };
  const membership = await getMembership((session.user as any).id, business.id);
  if (!membership || membership.role !== "owner") {
    return { error: NextResponse.json({ error: "Owner access required" }, { status: 403 }) };
  }
  return { business };
}

export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const a = await owner(params.slug);
  if (a.error) return a.error;
  const business = a.business!;
  const setting = await prisma.siteChatSetting.findUnique({ where: { businessId: business.id } });
  const id = req.nextUrl.searchParams.get("id");

  if (id) {
    const chat = await prisma.siteChat.findFirst({ where: { id, businessId: business.id } });
    if (!chat) return NextResponse.json({ error: "Chat not found" }, { status: 404 });
    const rows = await prisma.siteChatMessage.findMany({ where: { chatId: chat.id }, orderBy: { createdAt: "asc" }, take: 300 });
    if (chat.ownerUnread) await prisma.siteChat.update({ where: { id: chat.id }, data: { ownerUnread: false } });
    return NextResponse.json({
      enabled: !!setting?.enabled,
      chat: { id: chat.id, name: chat.name, contact: chat.contact, city: chat.city, region: chat.region },
      messages: rows.map((m) => ({ id: m.id, fromOwner: m.fromOwner, text: m.text, at: m.createdAt })),
    });
  }

  const chats = await prisma.siteChat.findMany({
    where: { businessId: business.id }, orderBy: { lastMessageAt: "desc" }, take: 100,
  });
  const last = chats.length
    ? await prisma.siteChatMessage.findMany({
        where: { chatId: { in: chats.map((c) => c.id) } }, orderBy: { createdAt: "desc" }, take: 600,
      })
    : [];
  const lastBy = new Map<string, (typeof last)[number]>();
  for (const m of last) if (!lastBy.has(m.chatId)) lastBy.set(m.chatId, m);
  return NextResponse.json({
    enabled: !!setting?.enabled,
    chats: chats.map((c) => ({
      id: c.id, sessionId: c.sessionId, name: c.name, contact: c.contact, city: c.city, region: c.region,
      unread: c.ownerUnread, lastMessageAt: c.lastMessageAt,
      lastText: lastBy.get(c.id)?.text || "", lastFromOwner: !!lastBy.get(c.id)?.fromOwner,
    })),
  });
}

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const a = await owner(params.slug);
  if (a.error) return a.error;
  const business = a.business!;
  const body = await req.json().catch(() => ({}));
  const text = String(body?.text || "").trim().slice(0, 600);
  let chat = body?.id ? await prisma.siteChat.findFirst({ where: { id: String(body.id), businessId: business.id } }) : null;
  // Starting a chat with someone who is on the website (from the Visitors page).
  if (!chat && body?.sessionId) {
    const sid = String(body.sessionId).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40);
    chat = await prisma.siteChat.findUnique({ where: { businessId_sessionId: { businessId: business.id, sessionId: sid } } });
    if (!chat) {
      const visit = await prisma.siteVisit.findUnique({ where: { businessId_sessionId: { businessId: business.id, sessionId: sid } } });
      if (!visit) return NextResponse.json({ error: "That visitor isn't on the site any more." }, { status: 404 });
      chat = await prisma.siteChat.create({ data: { businessId: business.id, sessionId: sid, city: visit.city, region: visit.region, ownerUnread: false } });
    }
  }
  if (!chat || !text) return NextResponse.json({ error: "Chat or message missing" }, { status: 400 });
  const msg = await prisma.siteChatMessage.create({ data: { chatId: chat.id, fromOwner: true, text } });
  await prisma.siteChat.update({ where: { id: chat.id }, data: { lastMessageAt: new Date(), ownerUnread: false } });
  return NextResponse.json({ ok: true, chatId: chat.id, message: { id: msg.id, fromOwner: true, text: msg.text, at: msg.createdAt } });
}

export async function PATCH(req: NextRequest, { params }: { params: { slug: string } }) {
  const a = await owner(params.slug);
  if (a.error) return a.error;
  const business = a.business!;
  const body = await req.json().catch(() => ({}));
  const enabled = !!body?.enabled;
  await prisma.siteChatSetting.upsert({
    where: { businessId: business.id },
    update: { enabled },
    create: { businessId: business.id, enabled },
  });
  return NextResponse.json({ ok: true, enabled });
}
