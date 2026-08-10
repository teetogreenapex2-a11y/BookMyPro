import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug, requireMembership, getBusinessInstructors } from "@/lib/tenant";
import { sendPushToMembership } from "@/lib/pushNotifications";
import { getBusinessAbsoluteUrl } from "@/lib/businessUrl";

async function authorizedMembershipFor(req: NextRequest, slug: string, conversationId: string) {
  const session = await getServerSession(authOptions);
  if (!session) return null;

  const business = await getBusinessBySlug(slug);
  if (!business) return null;

  const membership = await requireMembership((session.user as any).id, business.id, ["owner", "instructor", "player"]);
  if (!membership) return null;

  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conversation || conversation.businessId !== business.id) return null;

  // A player can only ever be in their own conversation - an
  // instructor/owner can see any conversation at this business, since
  // the whole point of one shared thread per player is that anyone on
  // staff can pick it up.
  if (membership.role === "player" && conversation.playerMembershipId !== membership.id) return null;

  return { business, membership, conversation };
}

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

  try {
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
  } catch (err) {
    // The message itself already saved successfully above - a
    // notification failure shouldn't ever cause the whole send to look
    // like it failed to the person who just sent it.
    console.error("Failed to send message notification:", err);
  }

  return NextResponse.json({ id: message.id, body: message.body, createdAt: message.createdAt, isMine: true });
}
