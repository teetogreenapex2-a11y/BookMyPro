import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug, getMembership } from "@/lib/tenant";
import { getOrCreateBoard, publicName, RaffleTier } from "@/lib/raffle";

async function viewerIsOwner(businessId: string) {
  const session = await getServerSession(authOptions);
  if (!session) return false;
  const m = await getMembership((session.user as any).id, businessId);
  return !!m && m.role === "owner" && m.status === "active";
}

// GET /api/{slug}/raffle - public. Customers see first name + last initial
// only; the owner also gets full names, emails and phones.
export async function GET(_req: NextRequest, { params }: { params: { slug: string } }) {
  const business = await getBusinessBySlug(params.slug);
  if (!business || !business.approved) return NextResponse.json({ error: "Business not found" }, { status: 404 });
  const isOwner = await viewerIsOwner(business.id);

  const board = isOwner
    ? await getOrCreateBoard(business.id)
    : await prisma.raffleBoard.findUnique({ where: { businessId: business.id } });
  if (!board) return NextResponse.json({ board: null, isOwner });

  const spaces = await prisma.raffleSpace.findMany({ where: { boardId: board.id }, orderBy: { number: "asc" } });
  return NextResponse.json({
    isOwner,
    board: {
      title: board.title,
      spaceCount: board.spaceCount,
      maxPerPerson: board.maxPerPerson,
      status: board.status,
      drawnAt: board.drawnAt,
      giftCardCents: board.giftCardCents,
      giftCardsIssuedAt: board.giftCardsIssuedAt,
      tiers: board.tiers as unknown as RaffleTier[],
    },
    spaces: spaces.map((s) => ({
      number: s.number,
      name: isOwner ? s.name : publicName(s.name),
      winnerTier: s.winnerTier,
      ...(isOwner ? { email: s.email, phone: s.phone } : {}),
    })),
  });
}

// POST /api/{slug}/raffle  { number, name, email, phone? }
// Public: no sign-in needed to claim a space. Limits are enforced here on the
// server (a space can only be claimed once; at most maxPerPerson per email).
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const business = await getBusinessBySlug(params.slug);
  if (!business || !business.approved) return NextResponse.json({ error: "Business not found" }, { status: 404 });
  const board = await prisma.raffleBoard.findUnique({ where: { businessId: business.id } });
  if (!board) return NextResponse.json({ error: "There's no raffle running right now" }, { status: 404 });
  if (board.status !== "open") return NextResponse.json({ error: "This raffle has already been drawn" }, { status: 400 });

  const body = await req.json().catch(() => null);
  const number = Number(body?.number);
  const name = String(body?.name || "").replace(/\s+/g, " ").trim();
  const email = String(body?.email || "").trim().toLowerCase();
  const phone = String(body?.phone || "").trim().slice(0, 20) || null;

  if (!Number.isInteger(number) || number < 1 || number > board.spaceCount) {
    return NextResponse.json({ error: "Pick a space on the board" }, { status: 400 });
  }
  if (name.length < 2 || name.length > 40) return NextResponse.json({ error: "Enter your name" }, { status: 400 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });

  const mine = await prisma.raffleSpace.count({ where: { boardId: board.id, email } });
  if (mine >= board.maxPerPerson) {
    return NextResponse.json({ error: `Limit ${board.maxPerPerson} spaces per person` }, { status: 400 });
  }

  try {
    await prisma.raffleSpace.create({ data: { boardId: board.id, number, name, email, phone } });
  } catch (e: any) {
    if (e?.code === "P2002") return NextResponse.json({ error: "Someone just took that space. Pick another." }, { status: 409 });
    throw e;
  }
  return NextResponse.json({ ok: true, yourSpaces: mine + 1, left: board.maxPerPerson - (mine + 1) }, { status: 201 });
}
