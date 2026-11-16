import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug, getMembership } from "@/lib/tenant";
import { sendVideoReviewedNotification } from "@/lib/email";

async function gate(slug: string, id: string) {
  const session = await getServerSession(authOptions);
  if (!session) return { error: NextResponse.json({ error: "Sign in required" }, { status: 401 }) } as const;
  const business = await getBusinessBySlug(slug);
  if (!business) return { error: NextResponse.json({ error: "Business not found" }, { status: 404 }) } as const;
  const submission = await prisma.videoSubmission.findFirst({ where: { id, businessId: business.id }, include: { player: { select: { email: true } } } });
  if (!submission) return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) } as const;
  const membership = await getMembership((session.user as any).id, business.id);
  if (membership?.role !== "owner" && submission.instructorMembershipId !== membership?.id) {
    return { error: NextResponse.json({ error: "Only the assigned instructor can do that" }, { status: 403 }) } as const;
  }
  return { business, submission } as const;
}

// POST { url } - attach an uploaded voice-over to the video.
export async function POST(req: NextRequest, { params }: { params: { slug: string; id: string } }) {
  const g = await gate(params.slug, params.id);
  if ("error" in g) return g.error;
  const { url } = await req.json();
  let host = "";
  try { host = new URL(String(url)).hostname; } catch { /* invalid */ }
  if (!host.endsWith(".public.blob.vercel-storage.com")) return NextResponse.json({ error: "Invalid file" }, { status: 400 });
  await prisma.videoSubmission.update({
    where: { id: g.submission.id },
    data: { voiceNoteUrl: url, ...(g.submission.status === "pending" ? { status: "reviewed", reviewedAt: new Date() } : {}) },
  });
  if (g.submission.status === "pending" && g.submission.player.email) {
    await sendVideoReviewedNotification(g.submission.player.email, { businessName: g.business.name, title: g.submission.title }).catch(() => {});
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: { slug: string; id: string } }) {
  const g = await gate(params.slug, params.id);
  if ("error" in g) return g.error;
  await prisma.videoSubmission.update({ where: { id: g.submission.id }, data: { voiceNoteUrl: null } });
  return NextResponse.json({ ok: true });
}
