import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBusinessInstructors } from "@/lib/tenant";
import { sendPushToMembership } from "@/lib/pushNotifications";
import { getBusinessAbsoluteUrl } from "@/lib/businessUrl";
import { authorizedMembershipFor } from "./auth";

// GET /api/{slug}/conversations/{id}/messages
// Also marks the other side's messages as read the moment this is
// called, since fetching the thread is what "opening it" means here -
// there's no separate "mark as read" action to remember to call.
export async function GET(req: NextRequest, { params }: { params: { slug: string; id: string } }) {
  const auth = await authorizedMembershipFor(req, params.slug, params.id);
  if (!auth) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const messages = await prisma.message.findMany({
    where: { conversationId: params.id },
    include: { sender: { select: { role: true, user: { select: { name: true, email: true } } } } },
    orderBy: { createdAt: "asc" },
  });

  await prisma.message.updateMany({
    where: { conversationId: params.id, senderMembershipId: { not: auth.membership.id }, readAt: null },
    data: { readAt: new Date() },
  });

  return NextResponse.json(
    messages.map((m) => ({
      id: m.id,
      body: m.body,
      imageUrl: m.imageUrl,
      createdAt: m.createdAt,
      isMine: m.senderMembershipId === auth.membership.id,
      senderName: m.sender.user.name || m.sender.user.email,
    }))
  );
}

// POST /api/{slug}/conversations/{id}/messages  { body }
export async function POST(req: NextRequest, { params }: { params: { slug: string; id: string } }) {
  const auth = await authorizedMembershipFor(req, params.slug, params.id);
  if (!auth) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { body } = await req.json();
  if (!body?.trim()) return NextResponse.json({ error: "Message can't be empty" }, { status: 400 });

  const message = await prisma.message.create({
    data: { conversationId: params.id, senderMembershipId: auth.membership.id, body: body.trim() },
  });

  await prisma.conversation.update({ where: { id: params.id }, data: { lastMessageAt: message.createdAt } });

  const url = getBusinessAbsoluteUrl(req, params.slug, auth.membership.role === "player" ? "/messages" : `/instructor/messages/${params.id}`);
  const preview = body.trim().length > 80 ? body.trim().slice(0, 80) + "..." : body.trim();

  if (auth.membership.role === "player") {
    // Notify every instructor/owner at the business - whoever's around
    // can pick it up, same as the shared-inbox idea behind one thread
    // per player rather than per instructor.
    const staff = await getBusinessInstructors(auth.business.id);
    await Promise.all(
      staff.map((s) => sendPushToMembership(s.id, { title: "New message", body: preview, url }))
    );
  } else {
    await sendPushToMembership(auth.conversation.playerMembershipId, { title: `Message from ${auth.business.name}`, body: preview, url });
  }

  return NextResponse.json({ id: message.id, body: message.body, imageUrl: null, createdAt: message.createdAt, isMine: true });
}
