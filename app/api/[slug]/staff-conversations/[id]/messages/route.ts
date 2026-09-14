import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug, requireMembership } from "@/lib/tenant";
import { getBusinessAbsoluteUrl } from "@/lib/businessUrl";
import { sendPushToMembership } from "@/lib/pushNotifications";

async function getAuthorizedConversation(slug: string, userId: string, conversationId: string) {
  const business = await getBusinessBySlug(slug);
  if (!business) return null;
  const membership = await requireMembership(userId, business.id, ["owner", "instructor"]);
  if (!membership) return null;
  const conversation = await prisma.staffConversation.findFirst({
    where: { id: conversationId, businessId: business.id, OR: [{ memberAId: membership.id }, { memberBId: membership.id }] },
  });
  if (!conversation) return null;
  return { business, membership, conversation };
}

// GET /api/{slug}/staff-conversations/{id}/messages
export async function GET(req: NextRequest, { params }: { params: { slug: string; id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const auth = await getAuthorizedConversation(params.slug, (session.user as any).id, params.id);
  if (!auth) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.staffMessage.updateMany({
    where: { conversationId: params.id, senderMembershipId: { not: auth.membership.id }, readAt: null },
    data: { readAt: new Date() },
  });

  const messages = await prisma.staffMessage.findMany({
    where: { conversationId: params.id },
    include: { sender: { select: { user: { select: { name: true, email: true } } } } },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(
    messages.map((m) => ({
      id: m.id,
      body: m.body,
      imageUrl: m.imageUrl,
      createdAt: m.createdAt,
      readAt: m.readAt,
      isMine: m.senderMembershipId === auth.membership.id,
      senderName: m.sender.user.name || m.sender.user.email,
    }))
  );
}

// POST /api/{slug}/staff-conversations/{id}/messages  { body }
export async function POST(req: NextRequest, { params }: { params: { slug: string; id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const auth = await getAuthorizedConversation(params.slug, (session.user as any).id, params.id);
  if (!auth) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { body } = await req.json();
  if (!body?.trim()) return NextResponse.json({ error: "Message can't be empty" }, { status: 400 });

  const message = await prisma.staffMessage.create({
    data: { conversationId: params.id, senderMembershipId: auth.membership.id, body: body.trim() },
  });
  await prisma.staffConversation.update({ where: { id: params.id }, data: { lastMessageAt: message.createdAt } });

  const otherMembershipId = auth.conversation.memberAId === auth.membership.id ? auth.conversation.memberBId : auth.conversation.memberAId;
  const url = getBusinessAbsoluteUrl(req, params.slug, `/instructor/staff-messages/${params.id}`);
  const preview = body.trim().length > 80 ? body.trim().slice(0, 80) + "..." : body.trim();
  await sendPushToMembership(otherMembershipId, { title: "New staff message", body: preview, url });

  return NextResponse.json({ id: message.id, body: message.body, imageUrl: null, createdAt: message.createdAt, readAt: null, isMine: true });
}
