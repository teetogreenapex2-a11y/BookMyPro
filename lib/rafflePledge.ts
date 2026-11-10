import Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { sendRaffleMessage } from "@/lib/email";
import { sendPushToMembership } from "@/lib/pushNotifications";

// Pledge-mode raffles: a customer's card is saved (Stripe setup mode) and
// charged only once every spot is filled. If it never fills, the owner
// cancels and nobody is ever charged.

const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const money = (c: number) => `$${(c / 100).toFixed(0)}`;

function stripeOpts(b: { paymentProvider: string | null; stripeAccountId: string | null }) {
  return b.paymentProvider === "stripe" && b.stripeAccountId ? { stripeAccount: b.stripeAccountId } : undefined;
}
function raffleUrl(slug: string, key: string) {
  const origin = process.env.NEXTAUTH_URL || "https://bookmypro.app";
  return `${origin}/${slug}/raffle${key === "main" ? "" : "/" + key}`;
}
async function getOwner(businessId: string) {
  return prisma.membership.findFirst({ where: { businessId, role: "owner", status: "active" }, select: { id: true, user: { select: { email: true } } } });
}
async function tellOwner(businessId: string, subject: string, heading: string, body: string, push: string, url: string) {
  const owner = await getOwner(businessId);
  if (!owner) return;
  if (owner.user.email) await sendRaffleMessage(owner.user.email, subject, heading, body, url).catch(() => {});
  await sendPushToMembership(owner.id, { title: subject, body: push, url }).catch(() => {});
}

// A customer finished saving their card: their spot becomes "pledged".
export async function fulfillPledgeSession(sessionId: string, businessId: string) {
  const business = await prisma.business.findUnique({ where: { id: businessId } });
  if (!business) return;
  const cs = await stripe.checkout.sessions.retrieve(sessionId, { expand: ["setup_intent"] }, stripeOpts(business as any));
  if (cs.status !== "complete" || cs.metadata?.kind !== "raffle_pledge" || cs.metadata?.businessId !== businessId) return;
  const si = cs.setup_intent as Stripe.SetupIntent | null;
  const pm = typeof si?.payment_method === "string" ? si.payment_method : si?.payment_method?.id;
  const customer = typeof cs.customer === "string" ? cs.customer : cs.customer?.id;
  if (!pm || !customer) return;

  const res = await prisma.raffleSpace.updateMany({
    where: { stripeSessionId: sessionId, pending: true },
    data: { pending: false, pledged: true, holdExpiresAt: null, stripeCustomerId: customer, stripePaymentMethodId: pm },
  });
  if (res.count === 0) return; // already handled (webhook and return check both run)

  try {
    const spaces = await prisma.raffleSpace.findMany({ where: { stripeSessionId: sessionId }, orderBy: { number: "asc" }, include: { board: true } });
    const first = spaces[0];
    if (!first) return;
    const board = first.board;
    const url = raffleUrl(business.slug, board.key);
    const nums = spaces.map((x) => x.number).join(", ");
    const filled = await prisma.raffleSpace.count({ where: { boardId: board.id, pending: false } });
    await sendRaffleMessage(
      first.email,
      `You're pledged - ${board.title}`,
      "You're pledged!",
      `<p>Hi ${esc(first.name)}, you've saved spot${spaces.length === 1 ? "" : "s"} <strong>${nums}</strong> in the ${esc(board.title)}.</p>
       <p><strong>You have not been charged.</strong> Your card is charged ${money(board.priceCents * spaces.length)} only when all ${board.spaceCount} spots are filled (${filled} of ${board.spaceCount} so far). If it doesn't fill, you are never charged.</p>`,
      url, "View the raffle"
    ).catch(() => {});
    await tellOwner(
      businessId,
      `Raffle pledge: ${first.name}`,
      "New raffle pledge",
      `<p><strong>${esc(first.name)}</strong> pledged spot${spaces.length === 1 ? "" : "s"} <strong>${nums}</strong> (${money(board.priceCents * spaces.length)}, not charged yet).</p>
       <p style="color:#5C6459;">${esc(first.email)}${first.phone ? " &middot; " + esc(first.phone) : ""}</p>
       <p><strong>${filled} of ${board.spaceCount}</strong> spots filled. Cards are charged automatically when it fills.</p>`,
      `${first.name} pledged spot ${nums} - ${filled} of ${board.spaceCount} filled`,
      url
    );
  } catch (e) {
    console.error("Pledge notification failed:", e);
  }
  const boardId = (await prisma.raffleSpace.findFirst({ where: { stripeSessionId: sessionId }, select: { boardId: true } }))?.boardId;
  if (boardId) await chargeBoardIfFull(boardId);
}

export async function chargeBoardIfFull(boardId: string) {
  const board = await prisma.raffleBoard.findUnique({ where: { id: boardId } });
  if (!board || !board.pledgeMode || board.chargedAt) return;
  const filled = await prisma.raffleSpace.count({ where: { boardId, pending: false } });
  if (filled >= board.spaceCount) await chargeBoard(boardId);
}

// Charge every pledged card. Runs once per board (claimed atomically).
export async function chargeBoard(boardId: string) {
  const claim = await prisma.raffleBoard.updateMany({ where: { id: boardId, chargedAt: null }, data: { chargedAt: new Date(), pledgeMode: false } });
  if (claim.count === 0) return null;
  const board = await prisma.raffleBoard.findUnique({ where: { id: boardId } });
  if (!board) return null;
  const business = await prisma.business.findUnique({ where: { id: board.businessId } });
  if (!business) return null;
  const opts = stripeOpts(business as any);
  const url = raffleUrl(business.slug, board.key);
  const pledged = await prisma.raffleSpace.findMany({ where: { boardId, pledged: true }, orderBy: { number: "asc" } });

  let ok = 0;
  const failed: string[] = [];
  for (const sp of pledged) {
    try {
      if (!sp.stripeCustomerId || !sp.stripePaymentMethodId) throw new Error("No saved card");
      const pi = await stripe.paymentIntents.create(
        {
          amount: board.priceCents, currency: "usd",
          customer: sp.stripeCustomerId, payment_method: sp.stripePaymentMethodId,
          off_session: true, confirm: true, receipt_email: sp.email,
          description: `${business.name} ${board.title} - space ${sp.number}`,
          metadata: { kind: "raffle_pledge_charge", spaceId: sp.id, businessId: business.id },
        },
        { ...(opts || {}), idempotencyKey: `raffle-pledge-${sp.id}` }
      );
      if (pi.status !== "succeeded") throw new Error(`Payment ${pi.status}`);
      await prisma.raffleSpace.update({ where: { id: sp.id }, data: { pledged: false } });
      ok++;
      await sendRaffleMessage(
        sp.email, `The ${board.title} is full - you're in!`, "The raffle filled - you're in!",
        `<p>Hi ${esc(sp.name)}, all ${board.spaceCount} spots are filled. Your card was charged <strong>${money(board.priceCents)}</strong> for spot <strong>${sp.number}</strong>. Good luck in the drawing!</p>`,
        url, "View the raffle"
      ).catch(() => {});
    } catch (e: any) {
      console.error("Raffle pledge charge failed:", sp.number, e?.message);
      await prisma.raffleSpace.delete({ where: { id: sp.id } }).catch(() => {});
      failed.push(`${sp.name} (spot ${sp.number})`);
      await sendRaffleMessage(
        sp.email, `Your card was declined - ${board.title}`, "We couldn't charge your card",
        `<p>Hi ${esc(sp.name)}, the ${esc(board.title)} filled up, but your card was declined, so spot ${sp.number} was released.</p>
         <p>If you still want in, open the raffle and claim an open spot (you'll pay right away).</p>`,
        url, "Open the raffle"
      ).catch(() => {});
    }
  }
  await tellOwner(
    business.id, `Raffle charged: ${ok} paid${failed.length ? `, ${failed.length} declined` : ""}`, "Raffle cards charged",
    `<p><strong>${ok}</strong> of ${pledged.length} cards were charged ${money(board.priceCents)} each.</p>${failed.length ? `<p>Declined (spot released): ${failed.map(esc).join(", ")}</p>` : "<p>No declines.</p>"}`,
    `${ok} of ${pledged.length} cards charged${failed.length ? `, ${failed.length} declined` : ""}`, url
  );
  return { ok, failed };
}

// The raffle didn't fill: free every pledged spot. Nobody was charged.
export async function cancelPledges(boardId: string) {
  const board = await prisma.raffleBoard.findUnique({ where: { id: boardId } });
  if (!board) return 0;
  const business = await prisma.business.findUnique({ where: { id: board.businessId }, select: { name: true, slug: true } });
  const pledged = await prisma.raffleSpace.findMany({ where: { boardId, pledged: true } });
  await prisma.raffleSpace.deleteMany({ where: { boardId, pledged: true } });
  const url = business ? raffleUrl(business.slug, board.key) : "";
  const seen = new Set<string>();
  for (const sp of pledged) {
    if (seen.has(sp.email)) continue;
    seen.add(sp.email);
    await sendRaffleMessage(
      sp.email, `${board.title} cancelled - you were not charged`, "The raffle didn't fill",
      `<p>Hi ${esc(sp.name)}, the ${esc(board.title)} didn't fill up, so it's been cancelled. <strong>Your card was not charged</strong> and nothing is owed. Thanks for pledging!</p>`
    ).catch(() => {});
  }
  return pledged.length;
}
