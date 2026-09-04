import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug, getMembership } from "@/lib/tenant";

// GET /api/{slug}/conversations/unread-count
//
// A single, total badge count - genuinely different logic depending on
// who's asking, since "unread" means the opposite thing from each side:
// a player wants to know about unread messages FROM staff, while staff
// want to know about unread messages FROM players, summed across every
// one of their conversations rather than any one specific thread.
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const membership = await getMembership((session.user as any).id, business.id);
  if (!membership) return NextResponse.json({ count: 0 });

  if (membership.role === "player") {
    const count = await prisma.message.count({
      where: {
        conversation: { businessId: business.id, playerMembershipId: membership.id },
        readAt: null,
        sender: { role: { not: "player" } },
      },
    });
    return NextResponse.json({ count });
  }

  // Staff (owner/instructor) - unread messages from players, across
  // every conversation at this business, not just one thread.
  const count = await prisma.message.count({
    where: {
      conversation: { businessId: business.id },
      readAt: null,
      sender: { role: "player" },
    },
  });
  return NextResponse.json({ count });
}
