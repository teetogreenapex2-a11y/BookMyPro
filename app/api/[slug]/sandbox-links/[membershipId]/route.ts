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