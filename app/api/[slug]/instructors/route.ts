import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getBusinessBySlug, getBusinessInstructors, getMembership } from "@/lib/tenant";

// GET /api/{slug}/instructors — every signed-in member can see this list
// (players need it to choose who to book with, instructors need it for the
// "New booking" form's instructor picker). ?includeInactive=true adds
// deactivated staff too, for the owner's Team management view in Settings
// only - anyone else's request for it is silently ignored, since a
// deactivated instructor showing up as a bookable option would defeat the
// whole point.
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const requesterMembership = await getMembership((session.user as any).id, business.id);
  const wantsInactive = req.nextUrl.searchParams.get("includeInactive") === "true";
  const includeInactive = wantsInactive && requesterMembership?.role === "owner";

  const instructors = await getBusinessInstructors(business.id, includeInactive);
  const shaped = instructors.map((m) => ({
    id: m.id, // this is the Membership id — what bookings actually reference
    name: m.user.name,
    email: m.user.email,
    image: m.user.image,
    role: m.role,
    status: m.status,
    specialty: m.specialty,
    // Each instructor's own pricing — spread directly rather than
    // hand-listing every field, since lib/pricing.ts's helpers just read
    // whichever field names they need off this object (see schema.prisma's
    // comment on Membership for why the field names mirror Business's).
    packageSingleEnabled: m.packageSingleEnabled,
    packagePlayingEnabled: m.packagePlayingEnabled,
    packageVideoEnabled: m.packageVideoEnabled,
    packageThreeEnabled: m.packageThreeEnabled,
    packageFiveEnabled: m.packageFiveEnabled,
    packageTenEnabled: m.packageTenEnabled,
    packageSinglePriceCents: m.packageSinglePriceCents,
    packagePlayingPriceCents: m.packagePlayingPriceCents,
    packageVideoPriceCents: m.packageVideoPriceCents,
    packageThreePriceCents: m.packageThreePriceCents,
    packageFivePriceCents: m.packageFivePriceCents,
    packageTenPriceCents: m.packageTenPriceCents,
    fittingDriverEnabled: m.fittingDriverEnabled,
    fittingIronEnabled: m.fittingIronEnabled,
    fittingFullEnabled: m.fittingFullEnabled,
    fittingDriverPriceCents: m.fittingDriverPriceCents,
    fittingIronPriceCents: m.fittingIronPriceCents,
    fittingFullPriceCents: m.fittingFullPriceCents,
  }));

  return NextResponse.json(shaped);
}
