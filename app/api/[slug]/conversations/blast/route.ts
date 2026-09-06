import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug, requireMembership } from "@/lib/tenant";
import { sendPushToMembership } from "@/lib/pushNotifications";
import { getBusinessAbsoluteUrl } from "@/lib/businessUrl";

// POST /api/{slug}/conversations/blast  { body }
//
// Sends one message to every customer at once - the same audience as the
// Customers page itself (every player membership at this business, no
// further filtering), and the exact same message-creation and
// notification pattern already used for a single conversation, just run
// once per customer instead of once.
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const membership = await requireMembership((session.user as any).id, business.id, ["owner", "instructor"]);
  if (!membership) return NextResponse.json({ error: "Instructor access required" }, { status: 403 });

  const { body } = await req.json();
  const text = body?.trim();
  if (!text) return NextResponse.json({ error: "Message can't be empty" }, { status: 400 });

  const players = await prisma.membership.findMany({
    where: { businessId: business.id, role: "player" },
  });

  const preview = text.length > 80 ? text.slice(0, 80) + "..." : text;
  let sent = 0;

  for (const player of players) {
    const conversation = await prisma.conversation.upsert({
      where: { businessId_playerMembershipId: { businessId: business.id, playerMembershipId: player.id } },
      update: {},
      create: { businessId: business.id, playerMembershipId: player.id },
    });

    const message = await prisma.message.create({
      data: { conversationId: conversation.id, senderMembershipId: membership.id, body: text },
    });
    await prisma.conversation.update({ where: { id: conversation.id }, data: { lastMessageAt: message.createdAt } });

    const url = getBusinessAbsoluteUrl(req, business.slug, "/messages");
    await sendPushToMembership(player.id, { title: `Message from ${business.name}`, body: preview, url }).catch(() => {});
    sent++;
  }

  return NextResponse.json({ sent });
}
