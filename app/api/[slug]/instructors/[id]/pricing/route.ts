import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getBusinessBySlug, getMembership } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";

// PATCH /api/{slug}/instructors/{id}/pricing
//
// Saves one instructor's own pricing fields - the owner can edit anyone's,
// an instructor can edit their own. This route previously, mistakenly held
// a duplicate copy of the parent /instructors list route's GET handler
// instead of its own real job - the actual list route already lives
// correctly and completely at app/api/[slug]/instructors/route.ts.
const ALLOWED_FIELDS = [
  "packageSingleEnabled", "packagePlayingEnabled", "packageVideoEnabled",
  "packageThreeEnabled", "packageFiveEnabled", "packageTenEnabled",
  "packageSinglePriceCents", "packagePlayingPriceCents", "packageVideoPriceCents",
  "packageThreePriceCents", "packageFivePriceCents", "packageTenPriceCents",
  "fittingDriverEnabled", "fittingIronEnabled", "fittingFullEnabled",
  "fittingDriverPriceCents", "fittingIronPriceCents", "fittingFullPriceCents",
  "playingLesson9Enabled", "playingLesson9PriceCents",
  "playingLesson18Enabled", "playingLesson18PriceCents",
  "customOffering1Name", "customOffering1PriceCents",
  "customOffering2Name", "customOffering2PriceCents",
  "customOffering3Name", "customOffering3PriceCents",
  "customOffering4Name", "customOffering4PriceCents",
  "customOffering5Name", "customOffering5PriceCents",
  "customOffering6Name", "customOffering6PriceCents",
] as const;

export async function PATCH(req: NextRequest, { params }: { params: { slug: string; id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const requesterMembership = await getMembership((session.user as any).id, business.id);
  const isOwner = requesterMembership?.role === "owner";
  const isSelf = requesterMembership?.id === params.id;
  if (!requesterMembership || !(isOwner || isSelf)) {
    return NextResponse.json({ error: "You can only edit your own pricing" }, { status: 403 });
  }

  const target = await prisma.membership.findFirst({ where: { id: params.id, businessId: business.id } });
  if (!target) return NextResponse.json({ error: "Instructor not found" }, { status: 404 });

  const body = await req.json();
  // Only ever writes fields on the known, explicit list above - anything
  // else in the request body (an id, a role, anything not pricing at all)
  // is silently ignored rather than trusted from the client directly.
  const data: Record<string, unknown> = {};
  for (const field of ALLOWED_FIELDS) {
    if (field in body) data[field] = body[field];
  }

  const updated = await prisma.membership.update({ where: { id: target.id }, data });
  return NextResponse.json(updated);
}
