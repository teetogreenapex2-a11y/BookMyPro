import { prisma } from "@/lib/prisma";
import { sendRafflePaidEmails } from "@/lib/email";
import { sendPushToMembership } from "@/lib/pushNotifications";

// Marks the spaces bought in one Stripe Checkout session as paid and, only the
// first time that happens, tells the owner and emails the customer a receipt.
// Safe to call from both the webhook and the return-from-checkout check.
export async function markRaffleSessionPaid(sessionId: string) {
  const res = await prisma.raffleSpace.updateMany({
    where: { stripeSessionId: sessionId, pending: true },
    data: { pending: false, holdExpiresAt: null },
  });
  if (res.count === 0) return 0;
  try {
    const spaces = await prisma.raffleSpace.findMany({ where: { stripeSessionId: sessionId }, orderBy: { number: "asc" }, include: { board: true } });
    const first = spaces[0];
    if (!first) return res.count;
    const business = await prisma.business.findUnique({ where: { id: first.board.businessId }, select: { name: true, slug: true } });
    const owner = await prisma.membership.findFirst({
      where: { businessId: first.board.businessId, role: "owner", status: "active" },
      select: { id: true, user: { select: { email: true } } },
    });
    if (!business) return res.count;
    const origin = process.env.NEXTAUTH_URL || "https://bookmypro.app";
    const raffleUrl = `${origin}/${business.slug}/raffle${first.board.key === "main" ? "" : "/" + first.board.key}`;
    const numbers = spaces.map((s) => s.number);
    const amountCents = first.board.priceCents * spaces.length;
    await sendRafflePaidEmails(owner?.user.email, {
      businessName: business.name, raffleTitle: first.board.title, name: first.name || "", email: first.email || "",
      phone: first.phone, numbers, amountCents, raffleUrl,
    });
    if (owner) {
      await sendPushToMembership(owner.id, {
        title: "Raffle space paid",
        body: `${first.name} paid for space${numbers.length === 1 ? "" : "s"} ${numbers.join(", ")} ($${(amountCents / 100).toFixed(0)})`,
        url: raffleUrl,
      }).catch(() => {});
    }
  } catch (e) {
    console.error("Raffle paid notification failed:", e);
  }
  return res.count;
}
