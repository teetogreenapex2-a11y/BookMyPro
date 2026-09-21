import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getBusinessBySlug, getBusinessInstructors, getInstructorById, getMembership } from "@/lib/tenant";

// GET /api/{slug}/instructors — publicly readable (no sign-in required):
// the booking page needs to show who's available to book with before a
// visitor has necessarily created an account, same reasoning as the
// availability/durations/groups routes. Anyone signed in still gets the
// exact same shape they always did; ?includeInactive=true still only
// works for a signed-in owner, for the Team management view in Settings.
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);

  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const requesterMembership = session ? await getMembership((session.user as any).id, business.id) : null;
  const isStaff = requesterMembership?.role === "owner" || requesterMembership?.role === "instructor";
  const wantsInactive = req.nextUrl.searchParams.get("includeInactive") === "true";
  const includeInactive = wantsInactive && requesterMembership?.role === "owner";

  let instructors;
  // A sandbox prospect (see sandbox-links/quick) is a throwaway preview
  // account, not a real hire - it shouldn't see the real team's names and
  // emails in Settings any more than it should see real customers (see the
  // same gate in players/route.ts). It only sees itself, same as a brand
  // new instructor would with no other teammates yet.
  //
  // getBusinessInstructors always excludes sandbox-prospect rows entirely
  // (see lib/tenant.ts), including the requester's own - so it can't be
  // filtered down to "just them", it has to be fetched separately.
  if (requesterMembership?.isSandboxProspect) {
    const self = await getInstructorById(business.id, requesterMembership.id);
    instructors = self ? [self] : [];
  } else {
    instructors = await getBusinessInstructors(business.id, includeInactive);
    // A player (or anyone not on staff) never sees a hidden instructor at
    // all - owner/instructor accounts still see everyone, since they're the
    // ones who'd need to manage or work alongside a hidden entry.
    if (!isStaff) instructors = instructors.filter((m) => !m.hiddenFromBooking);
  }

  const shaped = instructors.map((m) => ({
    id: m.id, // this is the Membership id — what bookings actually reference
    name: m.user.name,
    // Only shared with a signed-in requester - a signed-out visitor
    // browsing who's available to book with doesn't need staff emails.
    email: session ? m.user.email : undefined,
    image: m.user.image,
    role: m.role,
    status: m.status,
    specialty: m.specialty,
    bio: m.bio,
    bioPhotoUrl: m.bioPhotoUrl,
    hiddenFromBooking: m.hiddenFromBooking,
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
    playingLesson9Enabled: m.playingLesson9Enabled,
    playingLesson9PriceCents: m.playingLesson9PriceCents,
    playingLesson18Enabled: m.playingLesson18Enabled,
    playingLesson18PriceCents: m.playingLesson18PriceCents,
    customOffering1Name: m.customOffering1Name,
    customOffering1PriceCents: m.customOffering1PriceCents,
    customOffering2Name: m.customOffering2Name,
    customOffering2PriceCents: m.customOffering2PriceCents,
    customOffering3Name: m.customOffering3Name,
    customOffering3PriceCents: m.customOffering3PriceCents,
    customOffering4Name: m.customOffering4Name,
    customOffering4PriceCents: m.customOffering4PriceCents,
    customOffering5Name: m.customOffering5Name,
    customOffering5PriceCents: m.customOffering5PriceCents,
    customOffering6Name: m.customOffering6Name,
    customOffering6PriceCents: m.customOffering6PriceCents,
  }));

  return NextResponse.json(shaped);
}
