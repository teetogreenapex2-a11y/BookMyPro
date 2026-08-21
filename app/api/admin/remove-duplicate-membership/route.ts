import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isPlatformAdmin } from "@/lib/tenant";

// GET  /api/admin/remove-duplicate-membership?membershipId=...  — preview,
//      shows exactly what's attached before anything is touched.
// POST /api/admin/remove-duplicate-membership { membershipId }  — deletes
//      the membership. Auto-generated Availability slots are cleared as
//      part of this (expected noise from seedInstructorAvailability, not
//      real data), but the delete is refused if any actual Booking,
//      Package, VideoSubmission, or SwingSketch is attached - those would
//      mean this membership isn't just an untouched duplicate after all.
//
// Temporary - built for the specific duplicate-Rick-Stitzer cleanup. Safe
// to delete once that's resolved.
async function inspect(membershipId: string) {
  const membership = await prisma.membership.findUnique({
    where: { id: membershipId },
    include: { user: true, business: { select: { slug: true } } },
  });
  if (!membership) return { membership: null, conversationIds: [] as string[] };

  const [availabilityCount, bookingCount, packageCount, videoCount, sketchCount, conversations] = await Promise.all([
    prisma.availability.count({ where: { instructorMembershipId: membershipId } }),
    prisma.booking.count({ where: { instructorMembershipId: membershipId } }),
    prisma.package.count({ where: { instructorMembershipId: membershipId } }),
    prisma.videoSubmission.count({ where: { instructorMembershipId: membershipId } }),
    prisma.swingSketch.count({ where: { instructorMembershipId: membershipId } }),
    prisma.conversation.findMany({ where: { playerMembershipId: membershipId }, select: { id: true } }),
  ]);
  const conversationIds = conversations.map((c) => c.id);
  const messageCount = conversationIds.length
    ? await prisma.message.count({ where: { conversationId: { in: conversationIds } } })
    : 0;

  const realDataCount = bookingCount + packageCount + videoCount + sketchCount;

  return {
    membership: {
      id: membership.id,
      role: membership.role,
      business: membership.business.slug,
      user: { id: membership.user.id, name: membership.user.name, email: membership.user.email },
    },
    attached: { availabilityCount, bookingCount, packageCount, videoCount, sketchCount, conversationCount: conversationIds.length, messageCount },
    safeToDelete: realDataCount === 0,
    conversationIds,
  };
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const isAdmin = await isPlatformAdmin((session.user as any).id);
  if (!isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const membershipId = req.nextUrl.searchParams.get("membershipId");
  if (!membershipId) return NextResponse.json({ error: "Pass ?membershipId=..." }, { status: 400 });

  const result = await inspect(membershipId);
  if (!result.membership) return NextResponse.json({ error: "Membership not found" }, { status: 404 });

  // Preview by default - add &confirm=yes-delete to actually delete, once
  // the preview's been checked. A GET (not POST) specifically so this can
  // be triggered just by visiting a link from a phone browser, using
  // whatever session is already signed in there.
  const confirmed = req.nextUrl.searchParams.get("confirm") === "yes-delete";
  if (!confirmed) return NextResponse.json({ preview: true, ...result });

  if (!result.safeToDelete) {
    return NextResponse.json(
      { error: "Refusing to delete - real data is attached to this membership.", ...result },
      { status: 409 }
    );
  }

  try {
    await prisma.$transaction([
      // Messages sent BY the other party, inside a conversation this
      // membership is the player side of - these wouldn't be caught by
      // the "sentMessages" cleanup below at all, since this membership
      // isn't their sender. Has to come before deleting the conversation
      // itself, which has to come before deleting the membership.
      prisma.message.deleteMany({ where: { conversationId: { in: result.conversationIds } } }),
      prisma.conversation.deleteMany({ where: { id: { in: result.conversationIds } } }),
      // These are device/notification-setup noise, not real business
      // data - the same category as Availability above, just not
      // checked for in safeToDelete since none of them would ever be a
      // reason to refuse the delete. Left unhandled, any of these still
      // pointing at this membership would block the delete below with a
      // foreign key error.
      prisma.pushSubscription.deleteMany({ where: { membershipId } }),
      prisma.fcmToken.deleteMany({ where: { membershipId } }),
      prisma.message.deleteMany({ where: { senderMembershipId: membershipId } }),
      prisma.availability.deleteMany({ where: { instructorMembershipId: membershipId } }),
      prisma.membership.delete({ where: { id: membershipId } }),
    ]);
  } catch (err: any) {
    return NextResponse.json(
      { error: "Delete failed", detail: err?.message || String(err), ...result },
      { status: 500 }
    );
  }

  return NextResponse.json({ deleted: true, ...result });
}
