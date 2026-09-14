import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug, requireMembership } from "@/lib/tenant";

// GET /api/{slug}/staff-conversations
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const membership = await requireMembership((session.user as any).id, business.id, ["owner", "instructor"]);
  if (!membership) return NextResponse.json({ error: "Staff access required" }, { status: 403 });

  const conversations = await prisma.staffConversation.findMany({
    where: { businessId: business.id, OR: [{ memberAId: membership.id }, { memberBId: membership.id }] },
    include: {
      memberA: { select: { id: true, role: true, user: { select: { name: true, email: true } } } },
      memberB: { select: { id: true, role: true, user: { select: { name: true, email: true } } } },
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
      _count: {
        select: { messages: { where: { readAt: null, senderMembershipId: { not: membership.id } } } },
      },
    },
    orderBy: { lastMessageAt: "desc" },
  });

  return NextResponse.json(
    conversations.map((c) => {
      const other = c.memberAId === membership.id ? c.memberB : c.memberA;
      const last = c.messages[0];
      const preview = last ? (last.body || (last.imageUrl ? "📷 Photo" : "")) : "";
      return {
        id: c.id,
        otherName: other.user.name || other.user.email,
        otherRole: other.role,
        lastMessageAt: c.lastMessageAt,
        lastMessagePreview: preview,
        unreadCount: c._count.messages,
      };
    })
  );
}
