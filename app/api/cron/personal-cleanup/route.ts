import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deleteSwingVideo } from "@/lib/videoStorage";
import { isPersonalComped, PERSONAL_GRACE_DAYS } from "@/lib/personal";

// GET /api/cron/personal-cleanup - daily. Deletes every saved video of a
// Personal user whose free week (or paid plan) ended more than
// PERSONAL_GRACE_DAYS ago and who never subscribed (or cancelled). Students
// of a pro (comped) and anyone paying or in a card retry are left alone.
// A stored file is kept if a pro was sent a copy (it is theirs to review).
export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret") || req.headers.get("authorization")?.replace("Bearer ", "");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = Date.now();
  const users = await prisma.user.findMany({
    where: { personalVideos: { some: {} }, personalStatus: { notIn: ["active", "trialing", "past_due"] } },
    select: { id: true, personalTrialEndsAt: true, personalLapsedAt: true },
  });

  let usersCleaned = 0;
  let videosDeleted = 0;
  for (const u of users) {
    if (u.personalTrialEndsAt && u.personalTrialEndsAt.getTime() > now) continue; // still in the free week
    const lapseStart = u.personalLapsedAt || u.personalTrialEndsAt;
    if (!lapseStart) continue;
    if (now < lapseStart.getTime() + PERSONAL_GRACE_DAYS * 86400000) continue;
    if (await isPersonalComped(u.id)) continue;

    const vids = await prisma.personalVideo.findMany({ where: { userId: u.id } });
    for (const v of vids) {
      await prisma.personalVideo.delete({ where: { id: v.id } });
      const shared = await prisma.videoSubmission.count({ where: { videoUrl: v.videoUrl } });
      if (shared === 0) await deleteSwingVideo(v.videoUrl);
      videosDeleted++;
    }
    usersCleaned++;
  }
  return NextResponse.json({ usersCleaned, videosDeleted });
}
