import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug, getMembership } from "@/lib/tenant";

// GET /api/{slug}/staff-conversations/unread-count
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const membership = await getMembership((session.user as any).id, business.id);
  if (!membership || membership.role === "player") return NextResponse.json({ count: 0 });

  const count = await prisma.staffMessage.count({
    where: {
      conversation: { businessId: business.id, OR: [{ memberAId: membership.id }, { memberBId: membership.id }] },
      readAt: null,
      senderMembershipId: { not: membership.id },
    },
  });
  return NextResponse.json({ count });
}
