import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug, requireMembership } from "@/lib/tenant";

// GET /api/{slug}/availability?start=ISO&end=ISO&instructorMembershipId=X
// Each instructor has their own independent timeline now — two instructors
// can both be open (or both booked) at the same startTime, since they're
// two different people. instructorMembershipId is required for this
// reason: there's no single "the business's" calendar anymore.
//
// This route has no auth check, since the player booking page needs to
// show availability without necessarily being signed in yet - which is
// exactly why a group slot's response only ever includes a spot COUNT
// here, never the actual roster of who's joined. Names are instructor-only
// information, fetched separately.
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const start = req.nextUrl.searchParams.get("start");
  const end = req.nextUrl.searchParams.get("end");
  const instructorMembershipId = req.nextUrl.searchParams.get("instructorMembershipId");
  if (!instructorMembershipId) {
    return NextResponse.json({ error: "instructorMembershipId is required" }, { status: 400 });
  }

  const slots = await prisma.availability.findMany({
    where: {
      businessId: business.id, // <- the tenant boundary; nothing outside this business can leak in
      instructorMembershipId,
      ...(start && end ? { startTime: { gte: new Date(start), lte: new Date(end) } } : {}),
    },
    include: {
      // Cancelled bookings shouldn't count toward a private slot looking
      // "booked" or a group slot's spot count - excluding them here means
      // every consumer of this data automatically gets that right, rather
      // than each place having to remember to filter it out itself.
      bookings: { where: { status: { not: "cancelled" } }, select: { serviceType: true, isRemote: true } },
    },
    orderBy: { startTime: "asc" },
  });

  const shaped = slots.map((s) => ({
    id: s.id,
    startTime: s.startTime,
    status: s.status,
    bookedServiceType: s.bookings[0]?.serviceType || null,
    bookedIsRemote: s.bookings[0]?.isRemote || false,
    allowLastMinute: s.allowLastMinute,
    isGroup: s.isGroup,
    groupCapacity: s.groupCapacity,
    groupPriceCents: s.groupPriceCents,
    groupSpotsTaken: s.isGroup ? s.bookings.length : undefined,
    groupCategory: s.groupCategory,
    groupAgeRange: s.groupAgeRange,
  }));

  return NextResponse.json(shaped);
}

// PATCH /api/{slug}/availability  { id, status?, allowLastMinute?, isGroup?, groupCapacity?, groupPriceCents? }
// Owner/instructor only. An instructor can only toggle their own slots; the
// owner can toggle anyone's on the team.
export async function PATCH(req: NextRequest, { params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const membership = await requireMembership((session.user as any).id, business.id, ["owner", "instructor"]);
  if (!membership) return NextResponse.json({ error: "Instructor access required for this business" }, { status: 403 });

  const { id, status, allowLastMinute, isGroup, groupCapacity, groupPriceCents, groupCategory, groupAgeRange } = await req.json();
  const VALID_CATEGORIES = ["men", "ladies", "junior_younger", "junior_older"];
  if (groupCategory !== undefined && groupCategory !== null && !VALID_CATEGORIES.includes(groupCategory)) {
    return NextResponse.json({ error: "Invalid group category" }, { status: 400 });
  }
  if (status !== undefined && !["open", "closed"].includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  // Scoping by businessId here (not just id) is what actually enforces the
  // tenant boundary — without it, a valid slot id from any business would work.
  const slot = await prisma.availability.findFirst({
    where: { id, businessId: business.id },
    include: { bookings: { where: { status: { not: "cancelled" } } } },
  });
  if (!slot) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isGroupEdit = isGroup !== undefined || groupCapacity !== undefined || groupPriceCents !== undefined;
  // A group slot can still have its capacity/price adjusted even once
  // it's full or has players in it - that's a different kind of edit than
  // the plain open/closed toggle, which only ever applies to an empty slot.
  if (!isGroupEdit && (slot.status === "booked" || slot.status === "pending" || slot.status === "full")) {
    return NextResponse.json({ error: "Cannot edit a booked or pending slot directly" }, { status: 400 });
  }
  if (membership.role !== "owner" && slot.instructorMembershipId !== membership.id) {
    return NextResponse.json({ error: "You can only edit your own availability" }, { status: 403 });
  }

  const data: Record<string, unknown> = {};
  if (status !== undefined) data.status = status;
  if (typeof allowLastMinute === "boolean") data.allowLastMinute = allowLastMinute;

  if (isGroup === true) {
    // Turning a slot into a group lesson for the first time - only makes
    // sense starting from a genuinely open, empty slot.
    if (slot.status !== "open" || slot.isGroup) {
      return NextResponse.json({ error: "Only a normal open slot can be turned into a group lesson" }, { status: 400 });
    }
    if (!Number.isInteger(groupCapacity) || groupCapacity < 1) {
      return NextResponse.json({ error: "Enter a valid number of spots" }, { status: 400 });
    }
    if (!Number.isInteger(groupPriceCents) || groupPriceCents < 0) {
      return NextResponse.json({ error: "Enter a valid price" }, { status: 400 });
    }
    data.isGroup = true;
    data.groupCapacity = groupCapacity;
    data.groupPriceCents = groupPriceCents;
    data.groupCategory = groupCategory || null;
    data.groupAgeRange = groupAgeRange?.trim() || null;
  } else if (slot.isGroup && groupCapacity !== undefined) {
    // Adjusting an existing group's capacity - can't shrink below however
    // many players have already joined.
    if (!Number.isInteger(groupCapacity) || groupCapacity < slot.bookings.length) {
      return NextResponse.json({ error: `Capacity can't be less than the ${slot.bookings.length} player(s) already in this group` }, { status: 400 });
    }
    data.groupCapacity = groupCapacity;
    // Reopen if raising capacity above a full group; the fuller-check
    // below decides the final status either way.
    if (slot.status === "full" && groupCapacity > slot.bookings.length) data.status = "open";
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const updated = await prisma.availability.update({ where: { id }, data });
  return NextResponse.json(updated);
}
