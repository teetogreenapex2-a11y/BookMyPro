import { getServerSession } from "next-auth";
import { redirect, notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug, requireMembership, getBasePaths } from "@/lib/tenant";
import { findPackage, findFitting, enabledPackages } from "@/lib/pricing";
import { businessPageMetadata } from "@/lib/pageMetadata";
import CustomersClient from "./CustomersClient";

export async function generateMetadata({ params }: { params: { slug: string } }) {
  return businessPageMetadata(params.slug, "Customers");
}

export default async function CustomersPage({ params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const business = await getBusinessBySlug(params.slug);
  if (!business) notFound();

  const membership = await requireMembership((session.user as any).id, business.id, ["owner", "instructor"]);
  const { basePath, apiBase } = getBasePaths(params.slug);
  if (!membership) redirect(`${basePath}/book`);

  const isOwner = membership.role === "owner";

  const playerMemberships = await prisma.membership.findMany({
    // Quick sandbox-invite placeholders (see sandbox-links/quick) are not
    // real customers - keep them off the ledger entirely.
    where: { businessId: business.id, role: "player", isSandboxProspect: false },
    include: {
      user: {
        include: {
          packages: {
            where: isOwner ? { businessId: business.id } : { businessId: business.id, instructorMembershipId: membership.id },
            orderBy: { createdAt: "desc" },
          },
          bookings: {
            where: isOwner
              ? { businessId: business.id, status: "confirmed" }
              : { businessId: business.id, status: "confirmed", instructorMembershipId: membership.id },
            orderBy: { startTime: "asc" },
          },
        },
      },
    },
  });

  // Pricing is per-instructor now — fetch every instructor once, then look
  // each package's own instructor up by id, so a package only ever offers
  // upgrade tiers priced by the same person it was originally bought from.
  const instructorMemberships = await prisma.membership.findMany({
    where: { businessId: business.id, role: { in: ["owner", "instructor"] } },
    include: { user: { select: { name: true, email: true } } },
  });
  const instructorsById = new Map(instructorMemberships.map((m) => [m.id, m]));

  // One query covering every player this instructor has an opinion on,
  // rather than a separate lookup per customer row.
  const aiPrefs = await prisma.aiAnalysisPreference.findMany({
    where: { instructorMembershipId: membership.id },
    select: { playerId: true, enabled: true },
  });
  const aiEnabledByPlayerId = new Map(aiPrefs.map((p) => [p.playerId, p.enabled]));

  const customers = playerMemberships
    .filter(({ user: p }) => isOwner || p.packages.length > 0 || p.bookings.length > 0)
    .map(({ user: p }) => {
    const upgradedFromIds = new Set(p.packages.map((pkg) => pkg.upgradedFromId).filter(Boolean));

    const now = new Date();
    const packages = p.packages.map((pkg) => {
      const instructorMembership = pkg.instructorMembershipId ? instructorsById.get(pkg.instructorMembershipId) : null;
      const upgradeTiers = instructorMembership
        ? enabledPackages(instructorMembership).filter((t) => t.lessons > pkg.lessonsTotal)
        : [];
      // The stored count still decrements the moment a lesson is
      // booked, since that's what actually prevents someone from
      // booking more lessons than they've paid for. What's shown here
      // is different on purpose: add back any lesson booked against
      // this package that hasn't happened yet, so the number a
      // customer and instructor actually see doesn't visibly drop
      // until the lesson's own time has genuinely passed.
      const upcomingAgainstThisPackage = p.bookings.filter(
        (b) => b.packageId === pkg.id && b.serviceType === "lesson" && b.startTime > now
      ).length;
      return {
        id: pkg.id,
        type: pkg.type,
        label: findPackage(pkg.type)?.label || pkg.type,
        lessonsTotal: pkg.lessonsTotal,
        lessonsRemaining: Math.min(pkg.lessonsRemaining + upcomingAgainstThisPackage, pkg.lessonsTotal),
        // The true, raw stored value - what "Adjust" should actually
        // read and save, since saving the computed display number back
        // would double-count any already-booked, upcoming lessons.
        rawLessonsRemaining: pkg.lessonsRemaining,
        paymentStatus: pkg.paymentStatus,
        balanceDueCents: pkg.balanceDueCents,
        creditCents: pkg.creditCents,
        instructorMembershipId: pkg.instructorMembershipId,
        instructorName: instructorMembership?.user.name || instructorMembership?.user.email || null,
        // Only a "single" package can be upgraded, and only once — hide the
        // action once a newer package already references this one as its source.
        canUpgrade: pkg.type === "single" && !upgradedFromIds.has(pkg.id),
        upgradeTiers,
      };
    });

    const fittings = p.bookings
      .filter((b) => b.serviceType === "fitting")
      .map((b) => ({
        id: b.id,
        label: b.fittingType ? findFitting(b.fittingType)?.label || b.fittingType : "Fitting",
        startTime: b.startTime.toISOString(),
      }));

    const lessons = p.bookings
      .filter((b) => b.serviceType === "lesson")
      .map((b) => ({
        id: b.id,
        startTime: b.startTime.toISOString(),
        isPast: b.startTime < new Date(),
        instructorName: b.instructorMembershipId ? instructorsById.get(b.instructorMembershipId)?.user.name || instructorsById.get(b.instructorMembershipId)?.user.email || null : null,
      }))
      .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());

    const upcomingLessons = p.bookings.filter(
      (b) => b.serviceType === "lesson" && b.startTime > new Date()
    ).length;

    return {
      id: p.id,
      // Empty, not "—": the client already shows a "No name set - click
      // to add" prompt and email-based initials for a blank name, and a
      // literal dash defeated both (cards showed "—" with a "–" avatar).
      name: p.name || "",
      email: p.email,
      phone: p.phone || "—",
      packages,
      fittings,
      lessons,
      totalLessonsRemaining: packages.reduce((sum, pkg) => sum + pkg.lessonsRemaining, 0),
      upcomingLessons,
      aiAnalysisEnabled: aiEnabledByPlayerId.get(p.id) ?? false,
    };
  });

  // Filter chips: real, active staff only. instructorMemberships above is
  // deliberately unfiltered (old packages still need their instructor's
  // name/pricing looked up), but used directly for the chips it listed
  // every sandbox-prospect placeholder plus duplicate memberships for the
  // same person. Group by user so one chip covers all of a person's
  // memberships, and filter packages against every one of those ids.
  const chipMap = new Map<string, { id: string; name: string; membershipIds: string[] }>();
  for (const m of instructorMemberships) {
    if (m.isSandboxProspect || m.status !== "active") continue;
    const existing = chipMap.get(m.userId);
    if (existing) existing.membershipIds.push(m.id);
    else chipMap.set(m.userId, { id: m.userId, name: m.user.name || m.user.email || "Instructor", membershipIds: [m.id] });
  }
  // Packages tied to a duplicate/inactive membership of the same person
  // should still match that person's chip.
  for (const m of instructorMemberships) {
    const chip = chipMap.get(m.userId);
    if (chip && !chip.membershipIds.includes(m.id)) chip.membershipIds.push(m.id);
  }
  const filterChips = Array.from(chipMap.values());

  return (
    <CustomersClient
      customers={customers}
      slug={params.slug}
      basePath={basePath}
      apiBase={apiBase}
      isOwner={isOwner}
      instructors={isOwner ? filterChips : []}
    />
  );
}
