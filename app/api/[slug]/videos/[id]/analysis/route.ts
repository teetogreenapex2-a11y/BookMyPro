import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug, getMembership } from "@/lib/tenant";

// POST /api/{slug}/videos/{id}/analysis { tempoRatio, backswingMs, downswingMs }
// The tempo is measured in the instructor's browser; this just stores it.
export async function POST(req: NextRequest, { params }: { params: { slug: string; id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });
  const submission = await prisma.videoSubmission.findFirst({ where: { id: params.id, businessId: business.id } });
  if (!submission) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const membership = await getMembership((session.user as any).id, business.id);
  if (membership?.role !== "owner" && submission.instructorMembershipId !== membership?.id) {
    return NextResponse.json({ error: "Only the assigned instructor can do that" }, { status: 403 });
  }
  const b = await req.json();
  const ratio = Number(b.tempoRatio), back = Math.round(Number(b.backswingMs)), down = Math.round(Number(b.downswingMs));
  if (!(ratio > 0.5 && ratio < 10) || !(back > 0 && back < 10000) || !(down > 0 && down < 10000)) {
    return NextResponse.json({ error: "That measurement doesn't look right" }, { status: 400 });
  }
  await prisma.videoSubmission.update({
    where: { id: submission.id },
    data: { tempoRatio: ratio, backswingMs: back, downswingMs: down, analyzedAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}
