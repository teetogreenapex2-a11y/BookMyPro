import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug, requireMembership } from "@/lib/tenant";

// DELETE /api/{slug}/players/{id}  ?force=true to proceed despite a warning
// Removes the player's Membership at this business only - their User
// account, and every booking/package/gift card/video tied to it, stay
// completely intact (those key off userId, not membershipId). This just
// takes them off the active customer list; it does not touch financial
// or booking history, which a real business needs to keep regardless of
// whether someone's still an active customer.
//
// A few things DO key off membershipId though, and have no cascade
// delete set up in the schema: their message thread with the business
// (Conversation/Message), and their push notification registrations
// (PushSubscription/FcmToken). Deleting the Membership before cleaning
// those up throws a foreign key constraint error (Prisma P2003) - this
// used to be unhandled, so any customer who'd ever messaged the business
// or had notifications enabled in the app couldn't be deleted at all,
// failing with a raw 500 and no useful error.
export async function DELETE(req: NextRequest, { params }: { params: { slug: string; id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const membership = await requireMembership((session.user as any).id, business.id, ["owner", "instructor"]);
  if (!membership) return NextResponse.json({ error: "Instructor access required" }, { status: 403 });

  const playerMembership = await prisma.membership.findFirst({
    where: { userId: params.id, businessId: business.id, role: "player" },
  });
  if (!playerMembership) return NextResponse.json({ error: "Customer not found" }, { status: 404 });

  const force = req.nextUrl.searchParams.get("force") === "true";

  if (!force) {
    const activePackages = await prisma.package.findMany({
      where: { userId: params.id, businessId: business.id, lessonsRemaining: { gt: 0 } },
    });
    if (activePackages.length > 0) {
      const totalRemaining = activePackages.reduce((sum, p) => sum + p.lessonsRemaining, 0);
      return NextResponse.json(
        {
          warning: true,
          message: `This customer has ${totalRemaining} unused lesson${totalRemaining === 1 ? "" : "s"} from ${activePackages.length} package${activePackages.length === 1 ? "" : "s"} they've already paid for. Deleting them won't refund or destroy those credits, but you won't be able to see or use them from your customer list anymore.`,
        },
        { status: 409 }
      );
    }
  }

  await prisma.$transaction([
    prisma.pushSubscription.deleteMany({ where: { membershipId: playerMembership.id } }),
    prisma.fcmToken.deleteMany({ where: { membershipId: playerMembership.id } }),
    // Every message in this player's conversation with the business,
    // whichever side sent it, plus the conversation itself - the
    // fallback senderMembershipId clause is just in case any message
    // this membership sent somehow isn't in that one conversation.
    prisma.message.deleteMany({ where: { conversation: { playerMembershipId: playerMembership.id } } }),
    prisma.message.deleteMany({ where: { senderMembershipId: playerMembership.id } }),
    prisma.conversation.deleteMany({ where: { playerMembershipId: playerMembership.id } }),
    prisma.membership.delete({ where: { id: playerMembership.id } }),
  ]);
  return NextResponse.json({ deleted: true });
}

// PATCH /api/{slug}/players/{id}  { name?, phone? }
// Lets an instructor fix up a customer's name (or phone) directly - most
// often needed for anyone who signed in via the email magic link instead
// of Google, since that path never collects a real name the way Google's
// sign-in does, leaving it blank until someone sets it manually.
export async function PATCH(req: NextRequest, { params }: { params: { slug: string; id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const membership = await requireMembership((session.user as any).id, business.id, ["owner", "instructor"]);
  if (!membership) return NextResponse.json({ error: "Instructor access required" }, { status: 403 });

  const playerMembership = await prisma.membership.findFirst({
    where: { userId: params.id, businessId: business.id, role: "player" },
  });
  if (!playerMembership) return NextResponse.json({ error: "Customer not found" }, { status: 404 });

  const { name, phone } = await req.json();
  const data: Record<string, unknown> = {};
  if (typeof name === "string" && name.trim()) data.name = name.trim();
  if (typeof phone === "string") data.phone = phone.trim() || null;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const updated = await prisma.user.update({ where: { id: params.id }, data });
  return NextResponse.json({ id: updated.id, name: updated.name, phone: updated.phone });
}
