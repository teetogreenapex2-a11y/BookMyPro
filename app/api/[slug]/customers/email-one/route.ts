import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug, requireMembership } from "@/lib/tenant";
import { sendMarketingBlastEmail, textToEmailHtml } from "@/lib/email";

// POST /api/{slug}/customers/email-one  { userId, subject, message }
// Owner only. A real email to ONE customer's inbox (the in-app "Message"
// button is separate). Same plain-text-to-paragraphs handling and
// unsubscribe link as the email blast; anyone who has unsubscribed is skipped.
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });
  const membership = await requireMembership((session.user as any).id, business.id, ["owner"]);
  if (!membership) return NextResponse.json({ error: "Owner access required" }, { status: 403 });

  const { userId, subject, message } = await req.json().catch(() => ({}));
  if (!userId || !subject?.trim() || !message?.trim()) {
    return NextResponse.json({ error: "Subject and message are required" }, { status: 400 });
  }

  // Only someone who is actually this business's customer.
  const m = await prisma.membership.findFirst({
    where: { businessId: business.id, userId: String(userId), role: "player" },
    include: { user: { select: { id: true, email: true, marketingOptOut: true } } },
  });
  if (!m || !m.user.email) return NextResponse.json({ error: "That customer has no email address." }, { status: 404 });
  if (m.user.marketingOptOut) return NextResponse.json({ error: "This customer unsubscribed from emails." }, { status: 400 });

  const bodyHtml = textToEmailHtml(message);

  await sendMarketingBlastEmail(m.user.email, String(subject).trim(), bodyHtml, {
    businessName: business.name,
    unsubscribeUserId: m.user.id,
    replyTo: business.notificationEmail || business.email,
  });
  return NextResponse.json({ ok: true });
}
