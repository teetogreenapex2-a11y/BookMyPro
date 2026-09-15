import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug, requireMembership } from "@/lib/tenant";

// GET /api/{slug}/profile/bio
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const membership = await requireMembership((session.user as any).id, business.id, ["owner", "instructor"]);
  if (!membership) return NextResponse.json({ error: "Staff access required" }, { status: 403 });

  return NextResponse.json({ bio: membership.bio, bioPhotoUrl: membership.bioPhotoUrl });
}

// POST /api/{slug}/profile/bio  { bio, targetMembershipId? }
//
// An instructor normally updates their own bio here. An owner can
// optionally pass targetMembershipId to update a specific team member's
// bio instead - verified to genuinely belong to this same business
// before anything is touched, so an owner can never reach into a
// different business's roster even by guessing an id. Without a target,
// this behaves exactly as before: the caller's own membership only.
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const membership = await requireMembership((session.user as any).id, business.id, ["owner", "instructor"]);
  if (!membership) return NextResponse.json({ error: "Staff access required" }, { status: 403 });

  const { bio, targetMembershipId } = await req.json();
  if (typeof bio !== "string") return NextResponse.json({ error: "bio must be a string" }, { status: 400 });
  if (bio.length > 2000) return NextResponse.json({ error: "Bio is too long" }, { status: 400 });

  let updateId = membership.id;
  if (targetMembershipId && targetMembershipId !== membership.id) {
    if (membership.role !== "owner") return NextResponse.json({ error: "Only the owner can edit someone else's bio" }, { status: 403 });
    const target = await prisma.membership.findFirst({ where: { id: targetMembershipId, businessId: business.id } });
    if (!target) return NextResponse.json({ error: "That team member wasn't found" }, { status: 404 });
    updateId = target.id;
  }

  await prisma.membership.update({ where: { id: updateId }, data: { bio: bio.trim() || null } });
  return NextResponse.json({ ok: true });
}
