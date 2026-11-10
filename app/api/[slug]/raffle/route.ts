import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug, getMembership } from "@/lib/tenant";
import { stripe, getAccountStatus } from "@/lib/stripe";
import { sendRaffleVenmoNotification } from "@/lib/email";
import { sendPushToMembership } from "@/lib/pushNotifications";
import { randomUUID } from "crypto";
import { getOrCreateBoard, normalizeRaffleKey, publicName, RaffleTier } from "@/lib/raffle";

async function viewerIsOwner(businessId: string) {
  const session = await getServerSession(authOptions);
  if (!session) return false;
  const m = await getMembership((session.user as any).id, businessId);
  return !!m && m.role === "owner" && m.status === "active";
}

// The owner's Venmo handle (set in Settings) - raffle Venmo payments go there.
async function findVenmoOwner(businessId: string) {
  return prisma.membership.findFirst({
    where: { businessId, role: "owner", status: "active", venmoHandle: { not: null } },
    select: { id: true, venmoHandle: true, user: { select: { email: true } } },
  });
}

// GET /api/{slug}/raffle - public. Customers see first name + last initial
// only; the owner also gets full names, emails and phones.
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const business = await getBusinessBySlug(params.slug);
  if (!business || !business.approved) return NextResponse.json({ error: "Business not found" }, { status: 404 });
  const isOwner = await viewerIsOwner(business.id);

  const key = normalizeRaffleKey(req.nextUrl.searchParams.get("key"));
  // The board is created the first time its link is opened, by anyone.
  const board = await getOrCreateBoard(business.id, key);
  if (!board) return NextResponse.json({ board: null, isOwner });

  // Back from Stripe Checkout: confirm the payment directly with Stripe so the
  // spaces are secured even if the webhook is late or misconfigured.
  const sid = req.nextUrl.searchParams.get("sid");
  if (sid && /^cs_[A-Za-z0-9_]+$/.test(sid)) {
    try {
      const useConnect = business.paymentProvider === "stripe" && !!business.stripeAccountId;
      const cs = await stripe.checkout.sessions.retrieve(sid, undefined, useConnect ? { stripeAccount: business.stripeAccountId! } : undefined);
      if (cs.payment_status === "paid" && cs.metadata?.kind === "raffle_space" && cs.metadata?.businessId === business.id) {
        await prisma.raffleSpace.updateMany({ where: { boardId: board.id, stripeSessionId: sid, pending: true }, data: { pending: false, holdExpiresAt: null } });
      }
    } catch (e) { console.error("Raffle payment check failed:", e); }
  }

  // Drop abandoned holds, then show paid spaces plus holds still in progress.
  await prisma.raffleSpace.deleteMany({ where: { boardId: board.id, pending: true, holdExpiresAt: { lt: new Date() } } });
  const spaces = await prisma.raffleSpace.findMany({ where: { boardId: board.id }, orderBy: { number: "asc" } });
  const venmoOwner = await findVenmoOwner(business.id);
  // For the owner: Venmo claims waiting for a "Mark paid", grouped by order.
  let pendingVenmo: any[] = [];
  if (isOwner) {
    const groups = new Map<string, any>();
    for (const sp of spaces.filter((x) => x.pending && x.payMethod === "venmo")) {
      const key = sp.groupId || sp.id;
      const g = groups.get(key) || { groupId: key, name: sp.name, email: sp.email, phone: sp.phone, numbers: [] as number[], amountCents: 0 };
      g.numbers.push(sp.number);
      g.amountCents += board.priceCents;
      groups.set(key, g);
    }
    pendingVenmo = Array.from(groups.values());
  }
  return NextResponse.json({
    isOwner,
    venmoAvailable: !!venmoOwner,
    pendingVenmo,
    board: {
      title: board.title,
      spaceCount: board.spaceCount,
      maxPerPerson: board.maxPerPerson,
      status: board.status,
      drawnAt: board.drawnAt,
      giftCardCents: board.giftCardCents,
      priceCents: board.priceCents,
      giftCardsIssuedAt: board.giftCardsIssuedAt,
      tiers: board.tiers as unknown as RaffleTier[],
    },
    spaces: spaces.map((s) => ({
      number: s.number,
      held: s.pending,
      name: s.pending ? "Reserved" : isOwner ? s.name : publicName(s.name),
      winnerTier: s.winnerTier,
      ...(isOwner ? { email: s.email, phone: s.phone } : {}),
    })),
  });
}

// POST /api/{slug}/raffle  { numbers: number[], name, email, phone?, method: "card" | "venmo" }
// Public: no sign-in needed. Up to maxPerPerson spaces can be claimed in one
// go. Card: spaces are held while the customer is at Stripe Checkout and
// become theirs when the webhook confirms payment. Venmo: spaces are
// reserved for 24 hours and the owner is told to confirm the payment.
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const business = await getBusinessBySlug(params.slug);
  if (!business || !business.approved) return NextResponse.json({ error: "Business not found" }, { status: 404 });
  const board = await getOrCreateBoard(business.id, normalizeRaffleKey(req.nextUrl.searchParams.get("key")));
  if (board.status !== "open") return NextResponse.json({ error: "This raffle has already been drawn" }, { status: 400 });

  const body = await req.json().catch(() => null);
  const rawNumbers: unknown[] = Array.isArray(body?.numbers) ? body.numbers : body?.number != null ? [body.number] : [];
  const numbers = Array.from(new Set(rawNumbers.map(Number)));
  const name = String(body?.name || "").replace(/\s+/g, " ").trim();
  const email = String(body?.email || "").trim().toLowerCase();
  const phone = String(body?.phone || "").trim().slice(0, 20) || null;
  const method = body?.method === "venmo" ? "venmo" : "card";

  if (numbers.length === 0 || numbers.some((n) => !Number.isInteger(n) || n < 1 || n > board.spaceCount)) {
    return NextResponse.json({ error: "Pick a space on the board" }, { status: 400 });
  }
  if (name.length < 2 || name.length > 40) return NextResponse.json({ error: "Enter your name" }, { status: 400 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });

  // Abandoned checkouts / unpaid Venmo reservations free their spaces once the hold runs out.
  await prisma.raffleSpace.deleteMany({ where: { boardId: board.id, pending: true, holdExpiresAt: { lt: new Date() } } });

  // A retry after a failed or abandoned payment replaces this person's own unpaid holds, so they aren't blocked by their own earlier attempt.
  await prisma.raffleSpace.deleteMany({ where: { boardId: board.id, email, pending: true } });

  const mine = await prisma.raffleSpace.count({ where: { boardId: board.id, email } });
  if (mine + numbers.length > board.maxPerPerson) {
    const left = Math.max(0, board.maxPerPerson - mine);
    return NextResponse.json({ error: left === 0 ? `Limit ${board.maxPerPerson} spaces per person` : `Limit ${board.maxPerPerson} spaces per person - you can claim ${left} more` }, { status: 400 });
  }

  // The owner can hand out spaces free; everyone else pays.
  const isOwner = await viewerIsOwner(business.id);
  const needsPayment = board.priceCents > 0 && !isOwner;
  const venmoOwner = needsPayment && method === "venmo" ? await findVenmoOwner(business.id) : null;
  if (needsPayment && method === "venmo" && !venmoOwner) {
    return NextResponse.json({ error: "Venmo isn't available right now. Pay by card instead." }, { status: 400 });
  }
  const totalCents = board.priceCents * numbers.length;
  const holdMinutes = method === "venmo" ? 24 * 60 : 31; // Stripe Checkout lasts at least 30 minutes
  const groupId = randomUUID();

  let created;
  try {
    created = await prisma.$transaction(
      numbers.map((n) =>
        prisma.raffleSpace.create({
          data: {
            boardId: board.id, number: n, name, email, phone, groupId,
            pending: needsPayment,
            payMethod: needsPayment ? method : null,
            holdExpiresAt: needsPayment ? new Date(Date.now() + holdMinutes * 60 * 1000) : null,
          },
        })
      )
    );
  } catch (e: any) {
    if (e?.code === "P2002") return NextResponse.json({ error: "Someone just took one of those spaces. Pick again." }, { status: 409 });
    throw e;
  }

  if (!needsPayment) {
    return NextResponse.json({ ok: true, count: numbers.length, yourSpaces: mine + numbers.length, left: board.maxPerPerson - (mine + numbers.length) }, { status: 201 });
  }

  const origin = process.env.NEXTAUTH_URL || "https://bookmypro.app";
  const raffleUrl = `${origin}/${params.slug}/raffle${board.key === "main" ? "" : "/" + board.key}`;
  const sorted = [...numbers].sort((a, b) => a - b);

  if (method === "venmo") {
    const note = `${business.name} ${board.title} - space${sorted.length === 1 ? "" : "s"} ${sorted.join(", ")}`;
    const handle = String(venmoOwner!.venmoHandle).replace(/^@/, "");
    const venmoUrl = `https://venmo.com/${encodeURIComponent(handle)}?txn=pay&amount=${(totalCents / 100).toFixed(2)}&note=${encodeURIComponent(note)}`;
    // Tell the owner someone is paying, so they know to confirm it.
    await Promise.allSettled([
      sendRaffleVenmoNotification(venmoOwner!.user.email, { businessName: business.name, name, email, phone, numbers: sorted, amountCents: totalCents, raffleUrl }),
      sendPushToMembership(venmoOwner!.id, { title: "Venmo raffle payment to confirm", body: `${name} reserved space${sorted.length === 1 ? "" : "s"} ${sorted.join(", ")} ($${(totalCents / 100).toFixed(0)})`, url: raffleUrl }),
    ]);
    return NextResponse.json({ ok: true, venmo: { url: venmoUrl, handle, amountCents: totalCents, note, numbers: sorted } }, { status: 201 });
  }

  // Card: payment goes straight to the studio's connected Stripe account when
  // it has one, otherwise to the platform account.
  const useConnect = business.paymentProvider === "stripe" && !!business.stripeAccountId;
  try {
    if (useConnect) {
      const acct = await getAccountStatus(business.stripeAccountId!);
      if (!acct.chargesEnabled) throw new Error("Card payments aren't set up yet.");
    }
    const checkout = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        customer_email: email,
        line_items: [{
          price_data: {
            currency: "usd",
            product_data: { name: `${business.name} ${board.title} - space${sorted.length === 1 ? "" : "s"} ${sorted.join(", ")}` },
            unit_amount: board.priceCents,
          },
          quantity: sorted.length,
        }],
        expires_at: Math.floor(Date.now() / 1000) + holdMinutes * 60,
        metadata: { kind: "raffle_space", businessId: business.id, count: String(sorted.length), unitCents: String(board.priceCents) },
        success_url: `${raffleUrl}?paid=1&sid={CHECKOUT_SESSION_ID}`,
        cancel_url: raffleUrl,
      },
      useConnect ? { stripeAccount: business.stripeAccountId! } : undefined
    );
    await prisma.raffleSpace.updateMany({ where: { id: { in: created.map((c) => c.id) } }, data: { stripeSessionId: checkout.id } });
    return NextResponse.json({ ok: true, url: checkout.url }, { status: 201 });
  } catch (e: any) {
    await prisma.raffleSpace.deleteMany({ where: { id: { in: created.map((c) => c.id) } } }).catch(() => {});
    return NextResponse.json({ error: e?.message || "Couldn't start the payment. Try again." }, { status: 500 });
  }
}
