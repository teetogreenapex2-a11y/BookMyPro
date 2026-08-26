import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug, requireMembership } from "@/lib/tenant";

// GET /api/{slug}/conversations
//
// Every conversation at this business, for the instructor's Messages
// Inbox list - one row per player, with the last message as a preview
// and a count of that player's own messages nobody on staff has read
// yet. This is genuinely a different, business-wide query from the
// sibling /conversations/{id}/messages route (which fetches every
// message within one specific conversation) - the two were previously,
// incorrectly, sharing the same misplaced code, which made this route
// 404 on every single call since it has no [id] segment in its URL at
// all for that code to have actually used.
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const membership = await requireMembership((session.user as any).id, business.id, ["owner", "instructor"]);
  if (!membership) return NextResponse.json({ error: "Instructor access required" }, { status: 403 });

  const conversations = await prisma.conversation.findMany({
    where: { businessId: business.id },
    include: {
      playerMembership: { select: { user: { select: { name: true, email: true } } } },
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
      _count: {
        select: {
          // A message with no readAt yet, sent by the player (not by
          // staff) - readAt is a single field on the message itself, set
          // whenever any staff member opens the thread, not per-reader,
          // so this genuinely means "unread by anyone on staff."
          messages: { where: { readAt: null, sender: { role: "player" } } },
        },
      },
    },
    orderBy: { lastMessageAt: "desc" },
  });

  return NextResponse.json(
    conversations.map((c) => {
      const last = c.messages[0];
      const preview = last ? (last.body || (last.imageUrl ? "📷 Photo" : "")) : "";
      return {
        id: c.id,
        playerName: c.playerMembership.user.name || c.playerMembership.user.email,
        lastMessageAt: c.lastMessageAt,
        lastMessagePreview: preview,
        unreadCount: c._count.messages,
      };
    })
  );
}
