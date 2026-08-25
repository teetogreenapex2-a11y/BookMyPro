import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug, getMembership } from "@/lib/tenant";

// PATCH /api/{slug}/instructors/{id}  { name?, specialty?, active?, hiddenFromBooking? }
// Profile-level fields (as opposed to pricing, handled by the sibling
// /pricing route) — name and specialty (the short tagline shown to
// players when choosing who to book with) can be edited by the owner or
// by the instructor themselves. name lives on the User record, not
// Membership, so it needs its own separate update call - mirrors the
// same "fix up a name" pattern already used for customers in
// /api/{slug}/players/{id}, most often needed for anyone who signed in
// via the email magic link, which never collects a real name.
// Deactivating/reactivating a team member (active) is owner-only - this
// is what "removing" someone who's left actually means: it keeps every
// real booking, package, video, and message they were ever part of fully
// intact, just takes them off the active instructor list and booking
// page, and is fully reversible if they come back. A hard delete was
// never the right tool for this - see the temporary
// /api/admin/remove-duplicate-membership route for why that's only safe
// for an account with zero real data attached.
// hiddenFromBooking is a different, narrower thing than active - it only
// controls whether players see this person as bookable, without touching
// their own access to the app at all (Settings, calendar connection,
// etc. keep working). For test/demo instructor accounts, internal-only
// staff, and similar.
export async function PATCH(req: NextRequest, { params }: { params: { slug: string; id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const requesterMembership = await getMembership((session.user as any).id, business.id);
  const isOwner = requesterMembership?.role === "owner";
  const isSelf = requesterMembership?.id === params.id;
  if (!isOwner && !isSelf) {
    return NextResponse.json({ error: "You can only edit your own profile" }, { status: 403 });
  }

  // Scoped by businessId so an id from a different business can never match here.
  const target = await prisma.membership.findFirst({
    where: { id: params.id, businessId: business.id, role: { in: ["owner", "instructor"] } },
  });
  if (!target) return NextResponse.json({ error: "Instructor not found" }, { status: 404 });

  const { name, specialty, active, hiddenFromBooking } = await req.json();
  const data: Record<string, unknown> = {};
  if (typeof specialty === "string") data.specialty = specialty.slice(0, 120);

  if (typeof active === "boolean") {
    if (!isOwner) return NextResponse.json({ error: "Only the owner can deactivate a team member" }, { status: 403 });
    if (isSelf && !active) return NextResponse.json({ error: "You can't deactivate yourself" }, { status: 400 });
    if (!active && target.role === "owner") {
      const otherActiveOwners = await prisma.membership.count({
        where: { businessId: business.id, role: "owner", status: "active", id: { not: target.id } },
      });
      if (otherActiveOwners === 0) {
        return NextResponse.json({ error: "Can't deactivate the only remaining owner" }, { status: 400 });
      }
    }
    data.status = active ? "active" : "inactive";
  }

  if (typeof hiddenFromBooking === "boolean") {
    if (!isOwner) return NextResponse.json({ error: "Only the owner can change booking-page visibility" }, { status: 403 });
    data.hiddenFromBooking = hiddenFromBooking;
  }

  let updatedName: string | null | undefined;
  if (typeof name === "string" && name.trim()) {
    const updatedUser = await prisma.user.update({ where: { id: target.userId }, data: { name: name.trim() } });
    updatedName = updatedUser.name;
  }

  const updated = await prisma.membership.update({ where: { id: target.id }, data });
  return NextResponse.json({ ...updated, name: updatedName ?? undefined });
}
