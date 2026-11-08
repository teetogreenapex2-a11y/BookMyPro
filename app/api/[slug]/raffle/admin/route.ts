import { NextRequest, NextResponse } from "next/server";
import { randomInt } from "crypto";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug, requireMembership } from "@/lib/tenant";
import { getOrCreateBoard, RaffleTier } from "@/lib/raffle";
import { generateGiftCardCode } from "@/lib/giftCards";
import { sendGiftCardEmail } from "@/lib/email";

export const maxDuration = 60;

// POST /api/{slug}/raffle/admin  { action: "draw" | "release" | "giftcards" | "reset" | "confirmvenmo" | "releasevenmo", number?, groupId?, sendEmail? }
// Owner only. Customers can claim spaces but can never draw, release or reset.
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });
  const membership = await requireMembership((session.user as any).id, business.id, ["owner"]);
  if (!membership) return NextResponse.json({ error: "Owner access required" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const board = await getOrCreateBoard(business.id, body.key);
  const tiers = board.tiers as unknown as RaffleTier[];

  if (body.action === "release") {
    if (board.status !== "open") return NextResponse.json({ error: "Already drawn" }, { status: 400 });
    await prisma.raffleSpace.deleteMany({ where: { boardId: board.id, number: Number(body.number) } });
    return NextResponse.json({ ok: true });
  }

  // Owner saw the Venmo payment arrive - the reserved spaces become paid.
  if (body.action === "confirmvenmo") {
    const groupId = String(body.groupId || "");
    if (!groupId) return NextResponse.json({ error: "Missing order" }, { status: 400 });
    const res = await prisma.raffleSpace.updateMany({
      where: { boardId: board.id, pending: true, payMethod: "venmo", OR: [{ groupId }, { id: groupId }] },
      data: { pending: false, holdExpiresAt: null },
    });
    if (res.count === 0) return NextResponse.json({ error: "That reservation has expired or was already confirmed. Use Claim to enter it for them." }, { status: 400 });
    return NextResponse.json({ ok: true, confirmed: res.count });
  }

  // Owner didn't get the Venmo payment - free the spaces.
  if (body.action === "releasevenmo") {
    const groupId = String(body.groupId || "");
    await prisma.raffleSpace.deleteMany({ where: { boardId: board.id, pending: true, payMethod: "venmo", OR: [{ groupId }, { id: groupId }] } });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "reset") {
    await prisma.$transaction([
      prisma.raffleSpace.deleteMany({ where: { boardId: board.id } }),
      prisma.raffleBoard.update({ where: { id: board.id }, data: { status: "open", drawnAt: null, giftCardsIssuedAt: null } }),
    ]);
    return NextResponse.json({ ok: true });
  }

  if (body.action === "draw") {
    if (board.status !== "open") return NextResponse.json({ error: "Already drawn" }, { status: 400 });
    const spaces = await prisma.raffleSpace.findMany({ where: { boardId: board.id, pending: false } });
    if (spaces.length < board.spaceCount) {
      return NextResponse.json({ error: `The board must be full to draw. ${spaces.length} of ${board.spaceCount} claimed and paid.` }, { status: 400 });
    }
    // Fisher-Yates with a cryptographic random source.
    const order = spaces.map((s) => s.id);
    for (let i = order.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [order[i], order[j]] = [order[j], order[i]];
    }
    const restIndex = tiers.findIndex((t) => t.rest);
    let idx = 0;
    const ops: any[] = [];
    tiers.forEach((t, ti) => {
      if (t.rest) return;
      for (let k = 0; k < t.count; k++) {
        ops.push(prisma.raffleSpace.update({ where: { id: order[idx] }, data: { winnerTier: ti } }));
        idx++;
      }
    });
    if (restIndex !== -1) {
      for (; idx < order.length; idx++) ops.push(prisma.raffleSpace.update({ where: { id: order[idx] }, data: { winnerTier: restIndex } }));
    }
    ops.push(prisma.raffleBoard.update({ where: { id: board.id }, data: { status: "drawn", drawnAt: new Date() } }));
    await prisma.$transaction(ops);
    return NextResponse.json({ ok: true });
  }

  if (body.action === "giftcards") {
    if (board.status !== "drawn") return NextResponse.json({ error: "Draw the winners first" }, { status: 400 });
    if (board.giftCardsIssuedAt) return NextResponse.json({ error: "Gift cards were already created for this raffle" }, { status: 400 });
    const restIndex = tiers.findIndex((t) => t.rest);
    if (restIndex === -1) return NextResponse.json({ error: "This raffle has no gift card tier" }, { status: 400 });
    const winners = await prisma.raffleSpace.findMany({ where: { boardId: board.id, winnerTier: restIndex }, orderBy: { number: "asc" } });
    const sendEmail = !!body.sendEmail;
    const message = `Thanks for playing the ${business.name} raffle!`;
    let created = 0;
    let emailed = 0;
    for (const sp of winners) {
      let user = await prisma.user.findUnique({ where: { email: sp.email } });
      if (!user) user = await prisma.user.create({ data: { email: sp.email, name: sp.name, phone: sp.phone } });
      await prisma.membership.upsert({
        where: { userId_businessId: { userId: user.id, businessId: business.id } },
        update: {},
        create: { userId: user.id, businessId: business.id, role: "player", source: "manual" },
      });
      const code = await generateGiftCardCode();
      await prisma.giftCard.create({
        data: {
          businessId: business.id, code,
          initialValueCents: board.giftCardCents, remainingValueCents: board.giftCardCents,
          purchasedByUserId: user.id, recipientName: sp.name, recipientEmail: sp.email, message,
        },
      });
      created++;
      if (sendEmail) {
        try {
          await sendGiftCardEmail(sp.email, { businessName: business.name, code, amountCents: board.giftCardCents, recipientName: sp.name, message });
          emailed++;
        } catch {}
        await new Promise((r) => setTimeout(r, 120));
      }
    }
    await prisma.raffleBoard.update({ where: { id: board.id }, data: { giftCardsIssuedAt: new Date() } });
    return NextResponse.json({ ok: true, created, emailed });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
