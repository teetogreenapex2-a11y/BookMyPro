import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendTrialExpiredNotification } from "@/lib/email";

// GET /api/cron/check-trials?secret=...  - runs daily via Vercel Cron.
// Finds any business whose 30-day trial expired since this last ran,
// and emails the platform admin about it - nothing happens to the
// business itself automatically, this is purely the notification that
// starts a real, human review.
export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret") || req.headers.get("authorization")?.replace("Bearer ", "");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminBusiness = await prisma.business.findUnique({ where: { slug: "tee-to-green-golf" } });
  const adminMembership = adminBusiness
    ? await prisma.membership.findFirst({ where: { businessId: adminBusiness.id, role: "owner" }, include: { user: true } })
    : null;
  const adminEmail = adminMembership?.user.email;

  // Newly expired since yesterday's run, and never notified about
  // before - checked via trialReviewedAt being empty, so this only
  // ever emails once per business, not every single day it sits
  // unreviewed.
  const newlyExpired = await prisma.business.findMany({
    where: { subscriptionStatus: "trial", trialEndsAt: { lt: new Date() }, trialReviewedAt: null },
    include: { memberships: { where: { role: "owner" }, include: { user: { select: { name: true, email: true } } } } },
  });

  let notified = 0;
  for (const business of newlyExpired) {
    if (adminEmail) {
      await sendTrialExpiredNotification(adminEmail, {
        businessName: business.name,
        ownerName: business.memberships[0]?.user.name || null,
        ownerEmail: business.memberships[0]?.user.email || null,
        reviewUrl: `${process.env.NEXTAUTH_URL}/admin/expiring-trials`,
      });
      notified++;
    }
    // Marks it as having been surfaced once, so it doesn't get emailed
    // again every day it sits unreviewed - the admin review screen
    // itself, not this notification, is what someone actually returns
    // to for the ongoing list.
    await prisma.business.update({ where: { id: business.id }, data: { trialReviewedAt: new Date() } });
  }

  return NextResponse.json({ notified });
}
