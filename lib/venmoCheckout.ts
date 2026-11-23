import Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { businessDestination } from "@/lib/businessUrl";
import { sendVenmoToConfirmEmail } from "@/lib/email";
import { sendPushToMembership } from "@/lib/pushNotifications";

export type VenmoInfo = { id: string; handle: string; amountCents: number; description: string; ref: string; payeeName: string; link: string };

// Who gets paid: the instructor being booked if they saved a Venmo handle,
// otherwise the owner. Null when nobody has a handle (Venmo not available).
export async function findVenmoPayee(businessId: string, instructorMembershipId?: string | null) {
  const select = { id: true, venmoHandle: true, user: { select: { name: true, email: true } } } as const;
  if (instructorMembershipId) {
    const m = await prisma.membership.findFirst({ where: { id: instructorMembershipId, businessId, status: "active", venmoHandle: { not: null } }, select });
    if (m?.venmoHandle) return m;
  }
  const o = await prisma.membership.findFirst({ where: { businessId, role: "owner", status: "active", venmoHandle: { not: null } }, select });
  return o?.venmoHandle ? o : null;
}

function venmoLink(handle: string, amountCents: number, note: string) {
  return `https://venmo.com/${encodeURIComponent(handle)}?txn=pay&amount=${(amountCents / 100).toFixed(2)}&note=${encodeURIComponent(note)}`;
}

// Same job as stripe.checkout.sessions.create, but when `venmo` is true it
// records a pending Venmo payment instead and returns the payment details.
export async function checkoutOrVenmo(
  params: Stripe.Checkout.SessionCreateParams,
  opts: Stripe.RequestOptions | undefined,
  ctx: { venmo: boolean; business: { id: string; name: string; slug: string }; userId: string; userEmail?: string | null; instructorMembershipId?: string | null }
): Promise<{ id?: string; url?: string | null; venmo?: VenmoInfo; error?: string }> {
  if (!ctx.venmo) {
    const cs = await stripe.checkout.sessions.create(params, opts);
    return { id: cs.id, url: cs.url };
  }
  const meta = (params.metadata || {}) as Record<string, string>;
  const instructorId = ctx.instructorMembershipId || meta.instructorMembershipId || null;
  const payee = await findVenmoPayee(ctx.business.id, instructorId);
  if (!payee?.venmoHandle) return { error: "Venmo isn't set up for this business yet." };
  const amountCents = (params.line_items || []).reduce((n, li: any) => n + (li.price_data?.unit_amount || 0) * (li.quantity || 1), 0);
  const description = String((params.line_items?.[0] as any)?.price_data?.product_data?.name || "Purchase");
  const pay = await prisma.venmoPayment.create({
    data: {
      businessId: ctx.business.id, userId: ctx.userId, payeeMembershipId: payee.id,
      kind: meta.kind || "other", description, amountCents,
      metadata: { ...meta, businessId: ctx.business.id }, customerEmail: meta.contactEmail || meta.recipientEmail || ctx.userEmail || null,
      customerName: meta.contactName || null,
    },
  });
  const ref = pay.id.slice(-5).toUpperCase();
  const info: VenmoInfo = {
    id: pay.id, handle: payee.venmoHandle, amountCents, description, ref,
    payeeName: payee.user.name || ctx.business.name,
    link: venmoLink(payee.venmoHandle, amountCents, `${description} #${ref}`),
  };
  try {
    const url = businessDestination(ctx.business.slug, "/venmo");
    await sendVenmoToConfirmEmail(payee.user.email, {
      businessName: ctx.business.name, what: description, amountCents, ref,
      customer: meta.contactName || ctx.userEmail || "A customer", customerEmail: pay.customerEmail, url,
    });
    await sendPushToMembership(payee.id, { title: "Venmo payment to confirm", body: `${meta.contactName || "A customer"}: ${description} ($${(amountCents / 100).toFixed(0)})`, url }).catch(() => {});
  } catch (e) { console.error("Venmo notify failed:", e); }
  return { venmo: info };
}

// Owner (or payee) taps Confirm: flip pending -> confirmed once, then run the
// same fulfilment the Stripe webhook runs (receipts, bookings, gift card code...).
export async function confirmVenmoPayment(id: string) {
  const claimed = await prisma.venmoPayment.updateMany({ where: { id, status: "pending" }, data: { status: "confirmed", confirmedAt: new Date() } });
  if (claimed.count === 0) return false;
  const pay = await prisma.venmoPayment.findUnique({ where: { id } });
  if (!pay) return false;
  if (pay.kind === "raffle") {
    // Raffle spaces were held when the customer reserved them; confirming makes them theirs.
    const gid = String((pay.metadata as any)?.raffleGroupId || "");
    const res = gid ? await prisma.raffleSpace.updateMany({ where: { groupId: gid, pending: true }, data: { pending: false, holdExpiresAt: null } }) : { count: 0 };
    if (res.count === 0) {
      const already = gid ? await prisma.raffleSpace.count({ where: { groupId: gid, pending: false } }) : 0;
      if (already === 0) {
        await prisma.venmoPayment.update({ where: { id }, data: { status: "pending", confirmedAt: null } });
        throw new Error("These raffle spaces expired and were released. Use Claim on the raffle page to enter them.");
      }
    }
    return true;
  }
  const { processStripeEvent } = await import("@/lib/stripeEvents");
  const session = {
    id: `venmo_${pay.id}`, mode: "payment", payment_status: "paid", amount_total: pay.amountCents,
    customer_email: pay.customerEmail, customer_details: { email: pay.customerEmail, name: pay.customerName },
    metadata: { ...(pay.metadata as Record<string, string>), paymentMethod: "venmo" },
  };
  try {
    await processStripeEvent({ id: `evt_venmo_${pay.id}`, type: "checkout.session.completed", data: { object: session } } as unknown as Stripe.Event);
  } catch (e) {
    // Put it back so the owner can tap Confirm again.
    await prisma.venmoPayment.update({ where: { id }, data: { status: "pending", confirmedAt: null } });
    throw e;
  }
  return true;
}

// Owner didn't get the money: drop it (and give shop stock back).
export async function cancelVenmoPayment(id: string) {
  const claimed = await prisma.venmoPayment.updateMany({ where: { id, status: "pending" }, data: { status: "cancelled" } });
  if (claimed.count === 0) return false;
  const pay = await prisma.venmoPayment.findUnique({ where: { id } });
  if (pay?.kind === "raffle") {
    const gid = String((pay.metadata as any)?.raffleGroupId || "");
    if (gid) await prisma.raffleSpace.deleteMany({ where: { groupId: gid, pending: true } });
    return true;
  }
  const orderId = (pay?.metadata as any)?.orderId;
  if (pay?.kind === "order" && orderId) {
    const order = await prisma.order.findUnique({ where: { id: orderId }, include: { items: true } });
    if (order && order.status === "pending") {
      for (const item of order.items) {
        if (item.variantId) await prisma.productVariant.update({ where: { id: item.variantId }, data: { stockQuantity: { increment: item.quantity } } });
        else {
          const product = await prisma.product.findUnique({ where: { id: item.productId } });
          if (product?.stockQuantity !== null && product?.stockQuantity !== undefined) await prisma.product.update({ where: { id: item.productId }, data: { stockQuantity: { increment: item.quantity } } });
        }
      }
      await prisma.order.update({ where: { id: order.id }, data: { status: "cancelled" } });
    }
  }
  return true;
}
