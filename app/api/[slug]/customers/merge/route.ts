import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug, requireMembership } from "@/lib/tenant";

// POST /api/{slug}/customers/merge  { keepUserId, mergeUserId }
// Owner only. Moves everything the "merge" customer has at THIS business
// (packages, bookings, videos, messages, orders, ...) onto the "keep"
// customer, then removes the merged customer's membership here. Used when
// the same person ended up with two customer records (e.g. one added by
// hand, one created when they signed in with a different email).
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });
  const owner = await requireMembership((session.user as any).id, business.id, ["owner"]);
  if (!owner) return NextResponse.json({ error: "Owner access required" }, { status: 403 });

  const { keepUserId, mergeUserId } = await req.json();
  if (!keepUserId || !mergeUserId || keepUserId === mergeUserId) {
    return NextResponse.json({ error: "Pick two different customers" }, { status: 400 });
  }

  const [keepM, fromM] = await Promise.all([
    prisma.membership.findUnique({ where: { userId_businessId: { userId: keepUserId, businessId: business.id } } }),
    prisma.membership.findUnique({ where: { userId_businessId: { userId: mergeUserId, businessId: business.id } } }),
  ]);
  if (!keepM || !fromM || keepM.role !== "player" || fromM.role !== "player") {
    return NextResponse.json({ error: "Both must be customers at this business" }, { status: 400 });
  }
  const bid = business.id;

  const moved = await prisma.$transaction(async (tx) => {
    const counts: Record<string, number> = {};
    const m = async (name: string, p: Promise<{ count: number }>) => { counts[name] = (await p).count; };

    await m("packages", tx.package.updateMany({ where: { businessId: bid, userId: mergeUserId }, data: { userId: keepUserId } }));
    await m("bookings", tx.booking.updateMany({ where: { businessId: bid, playerId: mergeUserId }, data: { playerId: keepUserId } }));
    await m("videos", tx.videoSubmission.updateMany({ where: { businessId: bid, playerId: mergeUserId }, data: { playerId: keepUserId } }));
    await m("sessions", tx.swingSession.updateMany({ where: { businessId: bid, playerId: mergeUserId }, data: { playerId: keepUserId } }));
    await m("sketches", tx.swingSketch.updateMany({ where: { businessId: bid, playerId: mergeUserId }, data: { playerId: keepUserId } }));
    await m("reviews", tx.review.updateMany({ where: { businessId: bid, playerId: mergeUserId }, data: { playerId: keepUserId } }));
    await m("playingRequests", tx.playingLessonRequest.updateMany({ where: { businessId: bid, playerId: mergeUserId }, data: { playerId: keepUserId } }));
    await m("orders", tx.order.updateMany({ where: { businessId: bid, buyerId: mergeUserId }, data: { buyerId: keepUserId } }));
    await m("giftCards", tx.giftCard.updateMany({ where: { businessId: bid, purchasedByUserId: mergeUserId }, data: { purchasedByUserId: keepUserId } }));

    // AI analysis switches: one row per instructor + player - keep the existing one on a clash.
    const prefs = await tx.aiAnalysisPreference.findMany({
      where: { playerId: mergeUserId, instructor: { businessId: bid } },
    });
    for (const p of prefs) {
      const clash = await tx.aiAnalysisPreference.findUnique({
        where: { instructorMembershipId_playerId: { instructorMembershipId: p.instructorMembershipId, playerId: keepUserId } },
      });
      if (clash) await tx.aiAnalysisPreference.delete({ where: { id: p.id } });
      else await tx.aiAnalysisPreference.update({ where: { id: p.id }, data: { playerId: keepUserId } });
    }

    // Message thread: one conversation per customer at a business.
    const fromConv = await tx.conversation.findUnique({ where: { businessId_playerMembershipId: { businessId: bid, playerMembershipId: fromM.id } } });
    const keepConv = await tx.conversation.findUnique({ where: { businessId_playerMembershipId: { businessId: bid, playerMembershipId: keepM.id } } });
    if (fromConv && keepConv) {
      await tx.message.updateMany({ where: { conversationId: fromConv.id }, data: { conversationId: keepConv.id } });
      await tx.conversation.update({
        where: { id: keepConv.id },
        data: { lastMessageAt: fromConv.lastMessageAt > keepConv.lastMessageAt ? fromConv.lastMessageAt : keepConv.lastMessageAt },
      });
      await tx.conversation.delete({ where: { id: fromConv.id } });
    } else if (fromConv) {
      await tx.conversation.update({ where: { id: fromConv.id }, data: { playerMembershipId: keepM.id } });
    }
    await tx.message.updateMany({ where: { senderMembershipId: fromM.id }, data: { senderMembershipId: keepM.id } });

    // Devices registered for notifications on the old record are dropped - the app registers again when opened.
    await tx.pushSubscription.deleteMany({ where: { membershipId: fromM.id } });
    await tx.fcmToken.deleteMany({ where: { membershipId: fromM.id } });

    // Fill gaps on the kept record from the merged one.
    const [keepU, fromU] = await Promise.all([
      tx.user.findUnique({ where: { id: keepUserId } }),
      tx.user.findUnique({ where: { id: mergeUserId } }),
    ]);
    if (keepU && fromU) {
      const patch: { name?: string; phone?: string } = {};
      if (!keepU.name && fromU.name) patch.name = fromU.name;
      if (!keepU.phone && fromU.phone) patch.phone = fromU.phone;
      if (Object.keys(patch).length) await tx.user.update({ where: { id: keepUserId }, data: patch });
    }

    await tx.membership.delete({ where: { id: fromM.id } });
    return counts;
  }, { timeout: 30000 });

  return NextResponse.json({ ok: true, moved });
}
