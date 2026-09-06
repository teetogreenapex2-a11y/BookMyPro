import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug, requireMembership } from "@/lib/tenant";

// POST /api/{slug}/availability/close-day  { slotIds, instructorMembershipId }
//
// Closes every slot id given, but only the ones that are genuinely still
// open and not a group lesson - the same server-side re-verification the
// frontend's own comment already promised, closing the gap on a bulk
// action ever silently overriding a real player commitment, even if the
// slot's status changed between when the page loaded and when this was
// tapped. This route simply never existed at all before now, which is
// why closing a day off never actually changed anything.
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const membership = await requireMembership((session.user as any).id, business.id, ["owner", "instructor"]);
  if (!membership) return NextResponse.json({ error: "Instructor access required" }, { status: 403 });

  const { slotIds, instructorMembershipId } = await req.json();
  if (!Array.isArray(slotIds) || slotIds.length === 0 || !instructorMembershipId) {
    return NextResponse.json({ error: "Nothing to close" }, { status: 400 });
  }

  const result = await prisma.availability.updateMany({
    where: {
      id: { in: slotIds },
      businessId: business.id,
      instructorMembershipId,
      status: "open",
      isGroup: false,
    },
    data: { status: "closed" },
  });

  return NextResponse.json({ closedCount: result.count });
}
