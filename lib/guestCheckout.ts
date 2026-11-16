import { prisma } from "@/lib/prisma";
import { ensureMembership } from "@/lib/tenant";

// Lets someone buy a lesson, deposit, fitting or group spot straight from a
// business's booking link without signing in first. Signed in? Same as
// before. Not signed in? The name, phone and email they type on the booking
// form create (or find) their account, and they become a customer of the
// business. They are not logged in afterwards - they can sign in later with
// the same email to see their bookings.
export async function resolveCheckoutUser(
  session: any,
  businessId: string,
  body: any,
  opts: { membership?: boolean; requirePhone?: boolean } = {}
): Promise<{ id: string; email: string } | { error: string; status: number }> {
  const sessionUserId = session?.user?.id as string | undefined;
  if (sessionUserId) {
    return { id: sessionUserId, email: session.user?.email || "" };
  }

  const name = String(body?.contactName || "").trim();
  const phone = String(body?.contactPhone || "").trim();
  const email = String(body?.contactEmail || "").trim().toLowerCase();
  const needPhone = opts.requirePhone !== false;
  if (!name || (needPhone && phone.replace(/\D/g, "").length < 7) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) {
    return { error: needPhone ? "Enter your name, phone number and a valid email to continue" : "Enter your name and a valid email to continue", status: 400 };
  }

  let user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true, email: true, name: true, phone: true },
  });
  if (!user) {
    user = await prisma.user.create({
      data: { email, name, ...(phone ? { phone } : {}) },
      select: { id: true, email: true, name: true, phone: true },
    });
  } else if (!user.name || (!user.phone && phone)) {
    await prisma.user.update({
      where: { id: user.id },
      data: { ...(user.name ? {} : { name }), ...(user.phone || !phone ? {} : { phone }) },
    });
  }

  if (opts.membership !== false) await ensureMembership(user.id, businessId, "player");
  return { id: user.id, email: user.email };
}
