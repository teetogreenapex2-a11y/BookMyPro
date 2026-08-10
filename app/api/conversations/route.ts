import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug, requireMembership } from "@/lib/tenant";

// GET /api/{slug}/conversations
// For a player: returns their single conversation with this business,
// creating it on first use rather than requiring some separate "start a
// chat" step - there's really only one thing a player would ever message
// this business about, so there's no reason to make them find or create
// a thread themselves.
// For an instructor/owner: returns every conversation at this business,
// newest activity first, so the inbox behaves like a normal inbox.
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const userId = (session.user as any).id;
  const membership = await requireMembership(userId, business.id, ["owner", "instructor", "player"]);
  if (!membership) return NextResponse.json({ error: "Not a member of this business" }, { status: 403 });

  if (membership.role === "player") {
    const conversation = await prisma.conversation.upsert({
      where: { businessId_playerMembershipId: { businessId: business.id, playerMembershipId: membership.id } },
      update: {},
      create: { businessId: business.id, playerMembershipId: membership.id },
    });
    return NextResponse.json([{ id: conversation.id, playerName: session.user?.name || session.user?.email, lastMessageAt: conversation.lastMessageAt }]);
  }

  // Owner/instructor - list every conversation at this business.
  const conversations = await prisma.conversation.findMany({
    where: { businessId: business.id },
    include: {
      playerMembership: { include: { user: { select: { name: true, email: true } } } },
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: { lastMessageAt: "desc" },
  });

  const result = await Promise.all(
    conversations.map(async (c) => {
      const unreadCount = await prisma.message.count({
        where: { conversationId: c.id, readAt: null, senderMembershipId: { not: membership.id }, sender: { role: "player" } },
      });
      return {
        id: c.id,
        playerName: c.playerMembership.user.name || c.playerMembership.user.email,
        lastMessageAt: c.lastMessageAt,
        lastMessagePreview: c.messages[0]?.body || "",
        unreadCount,
      };
    })
  );

  return NextResponse.json(result);
}
