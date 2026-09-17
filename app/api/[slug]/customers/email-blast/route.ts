import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug, requireMembership } from "@/lib/tenant";
import { sendMarketingBlastEmail } from "@/lib/email";

// Sending one email at a time (see the loop below) can run past Vercel's
// default 10s limit once the list gets past a couple dozen people -
// extending it here rather than parallelizing the sends, since Resend
// itself rate-limits how fast this can go regardless.
export const maxDuration = 60;

// POST /api/{slug}/customers/email-blast  { subject, message }
//
// Owner-only (unlike the in-app "message all" blast, which instructors can
// also send - this one leaves the app entirely and lands in someone's
// inbox, so it's a bigger decision to make on the business's behalf).
// message is plain text from the composer - kept simple and turned into
// paragraphs here rather than accepting raw HTML, so there's no way to
// accidentally ship broken markup to hundreds of inboxes at once.
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const membership = await requireMembership((session.user as any).id, business.id, ["owner"]);
  if (!membership) return NextResponse.json({ error: "Owner access required" }, { status: 403 });

  const { subject, message } = await req.json();
  if (!subject?.trim() || !message?.trim()) {
    return NextResponse.json({ error: "Subject and message are required" }, { status: 400 });
  }

  const recipients = await prisma.membership.findMany({
    where: { businessId: business.id, role: "player" },
    include: { user: { select: { id: true, email: true, marketingOptOut: true } } },
  });

  const toSend = recipients
    .map((m) => m.user)
    .filter((u) => u.email && !u.marketingOptOut);
  const optedOutCount = recipients.length - toSend.length;

  // Sending one at a time (see below) at ~60s of runtime, this is roughly
  // the ceiling before the function itself times out mid-send - better to
  // fail clearly upfront than send half a list and leave the rest guessing
  // whether they're on it.
  const MAX_RECIPIENTS = 250;
  if (toSend.length > MAX_RECIPIENTS) {
    return NextResponse.json(
      { error: `That's ${toSend.length} recipients - please contact support to send to more than ${MAX_RECIPIENTS} at once for now.` },
      { status: 400 }
    );
  }

  const bodyHtml = message
    .trim()
    .split(/\n{2,}/)
    .map((para: string) => `<p style="margin: 0 0 14px;">${para.replace(/\n/g, "<br/>")}</p>`)
    .join("");

  // Resend's own rate limit is per-second, not a batch API concern here -
  // sending one at a time with a small delay keeps this well under it
  // without needing a queue for what's realistically a few hundred
  // recipients at most.
  let sent = 0;
  for (const user of toSend) {
    await sendMarketingBlastEmail(user.email, subject.trim(), bodyHtml, {
      businessName: business.name,
      unsubscribeUserId: user.id,
    });
    sent++;
    await new Promise((r) => setTimeout(r, 120));
  }

  return NextResponse.json({ sent, optedOut: optedOutCount, totalCustomers: recipients.length });
}
