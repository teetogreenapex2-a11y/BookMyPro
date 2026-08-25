import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug, requireMembership } from "@/lib/tenant";

// GET  /api/{slug}/players/{id}/ai-analysis
// PATCH /api/{slug}/players/{id}/ai-analysis  { enabled }
//
// Scoped to the signed-in instructor's own relationship with this one
// player - not a business-wide or per-instructor switch. A player might
// be fine with AI pose detection for one instructor but not another, and
// an instructor might want it on for some students and off for others,
// so this is genuinely a per-pair setting, not a broader toggle.
export async function GET(req: NextRequest, { params }: { params: { slug: string; id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const membership = await requireMembership((session.user as any).id, business.id, ["owner", "instructor"]);
  if (!membership) return NextResponse.json({ error: "Instructor access required" }, { status: 403 });

  const pref = await prisma.aiAnalysisPreference.findUnique({
    where: { instructorMembershipId_playerId: { instructorMembershipId: membership.id, playerId: params.id } },
  });
  // No row at all means it's never been turned on for this pair - off by default.
  return NextResponse.json({ enabled: pref?.enabled ?? false });
}

export async function PATCH(req: NextRequest, { params }: { params: { slug: string; id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const membership = await requireMembership((session.user as any).id, business.id, ["owner", "instructor"]);
  if (!membership) return NextResponse.json({ error: "Instructor access required" }, { status: 403 });

  const { enabled } = await req.json();
  if (typeof enabled !== "boolean") return NextResponse.json({ error: "enabled must be true or false" }, { status: 400 });

  const pref = await prisma.aiAnalysisPreference.upsert({
    where: { instructorMembershipId_playerId: { instructorMembershipId: membership.id, playerId: params.id } },
    update: { enabled },
    create: { instructorMembershipId: membership.id, playerId: params.id, enabled },
  });
  return NextResponse.json({ enabled: pref.enabled });
}
