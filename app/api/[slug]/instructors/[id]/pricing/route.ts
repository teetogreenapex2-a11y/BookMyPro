import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug, getMembership } from "@/lib/tenant";

const EDITABLE_FIELDS = [
  "packageSingleEnabled", "packagePlayingEnabled", "packageVideoEnabled", "packageThreeEnabled", "packageFiveEnabled", "packageTenEnabled",
  "packageSinglePriceCents", "packagePlayingPriceCents", "packageVideoPriceCents", "packageThreePriceCents", "packageFivePriceCents", "packageTenPriceCents",
  "fittingDriverEnabled", "fittingIronEnabled", "fittingFullEnabled",
  "fittingDriverPriceCents", "fittingIronPriceCents", "fittingFullPriceCents",
];

// PATCH /api/{slug}/instructors/{id}/pricing
// The owner can edit anyone's pricing; an instructor can edit their own.
// (id here is the target instructor's Membership id, same id used
// everywhere else — bookings, the player picker, etc.)
export async function PATCH(req: NextRequest, { params }: { params: { slug: string; id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const requesterMembership = await getMembership((session.user as any).id, business.id);
  const isOwner = requesterMembership?.role === "owner";
  const isSelf = requesterMembership?.id === params.id;
  if (!isOwner && !isSelf) {
    return NextResponse.json({ error: "You can only edit your own pricing" }, { status: 403 });
  }

  // Scoped by businessId so an id from a different business can never match here.
  const target = await prisma.membership.findFirst({
    where: { id: params.id, businessId: business.id, role: { in: ["owner", "instructor"] } },
  });
  if (!target) return NextResponse.json({ error: "Instructor not found" }, { status: 404 });

  const body = await req.json();
  const data: Record<string, unknown> = {};
  for (const key of EDITABLE_FIELDS) if (key in body) data[key] = body[key];

  const updated = await prisma.membership.update({ where: { id: target.id }, data });
  return NextResponse.json(updated);
}
