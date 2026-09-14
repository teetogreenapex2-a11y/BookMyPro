import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug, requireMembership } from "@/lib/tenant";

// POST /api/{slug}/staff-conversations/start  { withMembershipId }
//
// Finds or creates the conversation between the caller and one specific
// colleague (owner<->instructor or instructor<->instructor). The two
// membership ids are always sorted the same way before storing, so the
// same pair of people always land in the same single conversation no
// matter who actually starts it.
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const membership = await requireMembership((session.user as any).id, business.id, ["owner", "instructor"]);
  if (!membership) return NextResponse.json({ error: "Staff access required" }, { status: 403 });

  const { withMembershipId } = await req.json();
  if (!withMembershipId) return NextResponse.json({ error: "withMembershipId required" }, { status: 400 });
  if (withMembershipId === membership.id) {
    return NextResponse.json({ error: "Can't start a conversation with yourself" }, { status: 400 });
  }

  const other = await prisma.membership.findFirst({
    where: { id: withMembershipId, businessId: business.id, role: { in: ["owner", "instructor"] } },
  });
  if (!other) return NextResponse.json({ error: "That person isn't staff at this business" }, { status: 404 });

  const [memberAId, memberBId] = [membership.id, withMembershipId].sort();

  const conversation = await prisma.staffConversation.upsert({
    where: { businessId_memberAId_memberBId: { businessId: business.id, memberAId, memberBId } },
    update: {},
    create: { businessId: business.id, memberAId, memberBId },
  });

  return NextResponse.json({ id: conversation.id });
}
