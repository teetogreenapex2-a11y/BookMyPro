import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug, getMembership } from "@/lib/tenant";
import { sendPushToMembership } from "@/lib/pushNotifications";
import { getBusinessAbsoluteUrl } from "@/lib/businessUrl";

// POST /api/{slug}/conversations/blast  { body }
//
// Sends one message to every customer's own conversation at once - the
// same real, one-thread-per-player conversation they'd already see if
// they messaged in individually, not some separate announcement
// channel. Scoped the same way the customer list itself already is: a
// regular instructor only reaches their own customers, the owner
// reaches everyone at the business.
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const membership = await getMembership((session.user as any).id, business.id);
  const isStaff = membership?.role === "owner" || membership?.role === "instructor";
  if (!membership || !isStaff) return NextResponse.json({ error: "Instructor access required" }, { status: 403 });

  const { body } = await req.json();
  if (!body?.trim()) return NextResponse.json({ error: "Message can't be empty" }, { status: 400 });
  const isOwner = membership.role === "owner";

  // Every real player at the business, scoped to just this instructor's
  // own customers unless they're the owner - same real history check
  // the customer list itself already uses, so this only reaches people
  // who've actually booked or bought something, not every account that
  // merely exists.
  const players = await prisma.membership.findMany({
    where: {
      businessId: business.id,
      role: "player",
      OR: isOwner
        ? undefined
        : [
            { packages: { some: { instructorMembershipId: membership.id } } },
            { bookings: { some: { instructorMembershipId: membership.id } } },
          ],
    },
    select: { id: true },
  });

  if (players.length === 0) {
    return NextResponse.json({ error: "No customers to message yet" }, { status: 400 });
  }

  const preview = body.trim().length > 80 ? body.trim().slice(0, 80) + "..." : body.trim();
  let sent = 0;

  for (const player of players) {
    const conversation = await prisma.conversation.upsert({
      where: { businessId_playerMembershipId: { businessId: business.id, playerMembershipId: player.id } },
      update: { lastMessageAt: new Date() },
      create: { businessId: business.id, playerMembershipId: player.id },
    });

    await prisma.message.create({
      data: { conversationId: conversation.id, senderMembershipId: membership.id, body: body.trim() },
    });
    sent++;

    try {
      await sendPushToMembership(player.id, {
        title: `Message from ${business.name}`,
        body: preview,
        url: getBusinessAbsoluteUrl(req, business.slug, "/messages"),
      });
    } catch (err) {
      // A single failed notification shouldn't stop the rest of the
      // blast from going out - the message itself already saved either way.
      console.error("Blast notification failed for one recipient:", err);
    }
  }

  return NextResponse.json({ sent });
}
