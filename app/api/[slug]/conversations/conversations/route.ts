import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug, requireMembership } from "@/lib/tenant";

// POST /api/{slug}/conversations/start  { playerMembershipId }
// Instructor/owner only - the reverse of what already happens
// automatically for a player (their conversation gets created the
// moment they open Messages). This is the missing other direction: a
// way to start a real conversation with a specific customer who hasn't
// messaged first, rather than only ever being able to reply.
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const membership = await requireMembership((session.user as any).id, business.id, ["owner", "instructor"]);
  if (!membership) return NextResponse.json({ error: "Instructor access required" }, { status: 403 });

  const { playerMembershipId } = await req.json();
  const playerMembership = await prisma.membership.findUnique({ where: { id: playerMembershipId } });
  if (!playerMembership || playerMembership.businessId !== business.id || playerMembership.role !== "player") {
    return NextResponse.json({ error: "Not a player at this business" }, { status: 400 });
  }

  const conversation = await prisma.conversation.upsert({
    where: { businessId_playerMembershipId: { businessId: business.id, playerMembershipId } },
    update: {},
    create: { businessId: business.id, playerMembershipId },
  });

  return NextResponse.json({ id: conversation.id });
}
