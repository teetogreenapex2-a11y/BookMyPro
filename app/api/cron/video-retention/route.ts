import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deleteSwingVideo } from "@/lib/videoStorage";

const RETENTION_DAYS = 90;

// GET /api/cron/video-retention?secret=...  - for a scheduled job (Vercel
// Cron) to call daily. Deletes any swing video submission older than 90
// days - the file from Blob storage, then the database record, in that
// order, so a failed file deletion doesn't leave an orphaned record that
// looks fine but points at nothing.
export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret") || req.headers.get("authorization")?.replace("Bearer ", "");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const expired = await prisma.videoSubmission.findMany({
    where: { submittedAt: { lt: cutoff } },
    select: { id: true, videoUrl: true },
  });

  let deleted = 0;
  for (const video of expired) {
    await deleteSwingVideo(video.videoUrl);
    // No cascade delete configured on VideoComment -> VideoSubmission, so
    // comments have to go first or the submission delete would fail on
    // the foreign key constraint for any video that has feedback on it.
    await prisma.videoComment.deleteMany({ where: { submissionId: video.id } });
    await prisma.videoSubmission.delete({ where: { id: video.id } });
    deleted++;
  }

  return NextResponse.json({ deleted, checkedCutoff: cutoff });
}
