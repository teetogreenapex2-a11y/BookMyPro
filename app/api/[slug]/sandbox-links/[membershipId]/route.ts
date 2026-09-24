import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getBusinessBySlug, getMembership } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";

// DELETE /api/{slug}/sandbox-links/{membershipId}
//
// Fully removes a throwaway sandbox-prospect membership created by
// POST /sandbox-links/quick. Unlike deleting a real customer (see
// /api/{slug}/players/{id}, which only drops the Membership and keeps
// the User and their history), this deletes the prospect's User row
// outright too - it's a single-use placeholder account
// (`<name> (sandbox prospect)`, an @bookmypro.invalid email) with no
// bookings, packages, or history worth preserving, and there's no other
// way to reach or reuse it once the invite link is dead. Owner-only,
// matching who's allowed to generate these links in the first place.
export async function DELETE(req: Request, { params }: { params: { slug: string; membershipId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const requesterMembership = await getMembership((session.user as any).id, business.id);
  if (requesterMembership?.role !== "owner") {
    return NextResponse.json({ error: "Only the owner can delete a sandbox prospect" }, { status: 403 });
  }

  const target = await prisma.membership.findUnique({ where: { id: params.membershipId } });
  // The isSandboxProspect check matters as much as the businessId one
  // here - the other two sandbox-link routes hand out links for real
  // team members and customers, and this endpoint must never be able to
  // delete one of those real accounts.
  if (!target || target.businessId !== business.id || !target.isSandboxProspect) {
    return NextResponse.json({ error: "Sandbox prospect not found" }, { status: 404 });
  }

  // The handoff row has no membershipId of its own to filter by, only the
  // one-time session token it was issued with - clean those up too so a
  // deleted prospect actually disappears from the panel instead of
  // lingering with a null membershipId.
  const sessions = await prisma.session.findMany({
    where: { userId: target.userId },
    select: { sessionToken: true },
  });
  const tokens = sessions.map((s) => s.sessionToken);

  // A sandbox prospect can be either role (see POST /sandbox-links/quick),
  // so the cleanup below covers both the player-side FKs (keyed by
  // target.userId) and the instructor-side ones (keyed by target.id, the
  // Membership id) unconditionally - cheap no-ops for whichever side
  // doesn't apply, and correct either way without a role branch here.
  // instructorMembershipId is optional on Booking/Package (auto-SetNull
  // on delete, left alone) but required on Availability/Review/
  // VideoSubmission/SwingSketch/AiAnalysisPreference/PlayingLessonRequest/
  // StaffConversation/StaffMessage - those block the Membership delete
  // below unless cleared first. An instructor prospect in particular
  // always has Availability rows, seeded the moment they're created (see
  // seedInstructorAvailability in sandbox-links/quick) - previously
  // missed here, which is what was actually throwing.
  const staffConversations = await prisma.staffConversation.findMany({
    where: { OR: [{ memberAId: target.id }, { memberBId: target.id }] },
    select: { id: true },
  });
  const staffConversationIds = staffConversations.map((c) => c.id);

  try {
    await prisma.$transaction([
      ...(tokens.length ? [prisma.nativeAuthHandoff.deleteMany({ where: { sessionToken: { in: tokens } } })] : []),
      // Same foreign keys that block deleting a real customer's
      // Membership (see /api/{slug}/players/{id}) apply just as much
      // here - a prospect who actually opened the redeemed link could
      // have registered for push notifications or been messaged during
      // the demo, and none of those rows cascade on their own. Without
      // this cleanup, prisma.membership.delete below throws a P2003
      // foreign key error that this route previously left unhandled,
      // surfacing to the owner as a bare "Something went wrong."
      prisma.pushSubscription.deleteMany({ where: { membershipId: target.id } }),
      prisma.fcmToken.deleteMany({ where: { membershipId: target.id } }),
      prisma.message.deleteMany({ where: { conversation: { playerMembershipId: target.id } } }),
      prisma.message.deleteMany({ where: { senderMembershipId: target.id } }),
      prisma.conversation.deleteMany({ where: { playerMembershipId: target.id } }),
      // Staff-to-staff messaging - only reachable for an instructor-role
      // prospect, but harmless to run regardless.
      ...(staffConversationIds.length
        ? [prisma.staffMessage.deleteMany({ where: { conversationId: { in: staffConversationIds } } })]
        : []),
      prisma.staffMessage.deleteMany({ where: { senderMembershipId: target.id } }),
      ...(staffConversationIds.length
        ? [prisma.staffConversation.deleteMany({ where: { id: { in: staffConversationIds } } })]
        : []),
      // Instructor-side seeded/demo data - Availability has no real-world
      // meaning once the membership is gone, so it's just deleted outright
      // rather than needing a parent row cleared first.
      prisma.availability.deleteMany({ where: { instructorMembershipId: target.id } }),
      // Unlike /api/{slug}/players/{id}, this route deletes the User row
      // itself, not just the Membership - so every table with a *required*
      // (non-nullable) foreign key to that User has to be cleared first, or
      // prisma.user.delete below throws the same kind of P2003 the calls
      // above were already guarding against. A prospect who only clicked
      // through the invite link never touches any of this, but one who
      // actually booked a slot, bought a package, or got a swing reviewed
      // during the demo will have rows here - and per this route's whole
      // premise (see the top of the file), none of it is worth preserving,
      // so it all gets purged rather than orphaned. Children that have their
      // own required FK to a row we're about to delete (Note/Review ->
      // Booking, VideoComment -> VideoSubmission, OrderItem -> Order) come
      // first; GiftCard/GiftCardRedemption links are nullable and get
      // auto-SetNull, so they're left alone.
      prisma.note.deleteMany({ where: { booking: { playerId: target.userId } } }),
      prisma.review.deleteMany({ where: { OR: [{ playerId: target.userId }, { instructorMembershipId: target.id }] } }),
      prisma.swingSketch.deleteMany({ where: { OR: [{ playerId: target.userId }, { instructorMembershipId: target.id }] } }),
      prisma.videoComment.deleteMany({
        where: { submission: { OR: [{ playerId: target.userId }, { instructorMembershipId: target.id }] } },
      }),
      prisma.videoSubmission.deleteMany({ where: { OR: [{ playerId: target.userId }, { instructorMembershipId: target.id }] } }),
      prisma.aiAnalysisPreference.deleteMany({ where: { OR: [{ playerId: target.userId }, { instructorMembershipId: target.id }] } }),
      prisma.orderItem.deleteMany({ where: { order: { buyerId: target.userId } } }),
      prisma.order.deleteMany({ where: { buyerId: target.userId } }),
      prisma.booking.deleteMany({ where: { playerId: target.userId } }),
      prisma.package.deleteMany({ where: { userId: target.userId } }),
      prisma.playingLessonRequest.deleteMany({ where: { OR: [{ playerId: target.userId }, { instructorMembershipId: target.id }] } }),
      prisma.membership.delete({ where: { id: target.id } }),
      // Deleting the User cascades its Session row(s) automatically (see
      // the onDelete: Cascade on Session.user in schema.prisma).
      prisma.user.delete({ where: { id: target.userId } }),
    ]);
  } catch (err) {
    console.error("Failed to delete sandbox prospect:", err);
    return NextResponse.json({ error: "Something went wrong deleting that prospect. Please try again." }, { status: 500 });
  }

  return NextResponse.json({ deleted: true });
}