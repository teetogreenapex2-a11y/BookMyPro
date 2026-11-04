import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug, requireMembership } from "@/lib/tenant";
import { generateGiftCardCode } from "@/lib/giftCards";
import { sendGiftCardEmail } from "@/lib/email";

export const maxDuration = 60;

// POST /api/{slug}/gift-cards/issue
//   { amountCents, recipients: [{ name, email }], message?, sendEmail? }
// Owner only. Creates a free gift card for each recipient (for prizes,
// promotions, goodwill) - no payment involved. Each card is attached to the
// recipient's account, so it shows in their own Gift Cards section once they
// sign in with that email. Anyone without an account yet gets one created,
// as a customer of this business.
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const membership = await requireMembership((session.user as any).id, business.id, ["owner"]);
  if (!membership) return NextResponse.json({ error: "Owner access required" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const amountCents = Math.round(Number(body?.amountCents));
  if (!Number.isFinite(amountCents) || amountCents < 100 || amountCents > 100000) {
    return NextResponse.json({ error: "Amount must be between $1 and $1,000" }, { status: 400 });
  }
  const list: any[] = Array.isArray(body?.recipients) ? body.recipients : [];
  if (list.length === 0) return NextResponse.json({ error: "Add at least one recipient" }, { status: 400 });
  if (list.length > 200) return NextResponse.json({ error: "Up to 200 gift cards at a time" }, { status: 400 });
  const message = String(body?.message || "").trim().slice(0, 300) || null;
  const sendEmail = !!body?.sendEmail;

  const created: { name: string; email: string; code: string; emailed: boolean }[] = [];
  const skipped: { name: string; email: string; reason: string }[] = [];
  const seen = new Set<string>();

  for (const r of list) {
    const name = String(r?.name || "").trim();
    const email = String(r?.email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      skipped.push({ name, email, reason: "Needs a valid email address" });
      continue;
    }
    if (seen.has(email)) {
      skipped.push({ name, email, reason: "Listed twice" });
      continue;
    }
    seen.add(email);

    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) user = await prisma.user.create({ data: { email, name: name || null } });
    await prisma.membership.upsert({
      where: { userId_businessId: { userId: user.id, businessId: business.id } },
      update: {},
      create: { userId: user.id, businessId: business.id, role: "player", source: "manual" },
    });

    const code = await generateGiftCardCode();
    await prisma.giftCard.create({
      data: {
        businessId: business.id,
        code,
        initialValueCents: amountCents,
        remainingValueCents: amountCents,
        purchasedByUserId: user.id,
        recipientName: name || user.name || null,
        recipientEmail: email,
        message,
      },
    });

    let emailed = false;
    if (sendEmail) {
      try {
        await sendGiftCardEmail(email, { businessName: business.name, code, amountCents, recipientName: name || user.name || null, message });
        emailed = true;
      } catch {}
      await new Promise((res) => setTimeout(res, 120));
    }
    created.push({ name: name || user.name || "", email, code, emailed });
  }

  return NextResponse.json({ created, skipped });
}
