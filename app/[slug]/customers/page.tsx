import { getServerSession } from "next-auth";
import { redirect, notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug, requireMembership, getBasePaths } from "@/lib/tenant";
import { findPackage, findFitting, enabledPackages } from "@/lib/pricing";
import CustomersClient from "./CustomersClient";

export default async function CustomersPage({ params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const business = await getBusinessBySlug(params.slug);
  if (!business) notFound();

  const membership = await requireMembership((session.user as any).id, business.id, ["owner", "instructor"]);
  const { basePath, apiBase } = getBasePaths(params.slug);
  if (!membership) redirect(`${basePath}/book`);

  const playerMemberships = await prisma.membership.findMany({
    where: { businessId: business.id, role: "player" },
    include: {
      user: {
        include: {
          packages: { where: { businessId: business.id }, orderBy: { createdAt: "desc" } },
          bookings: { where: { businessId: business.id, status: "confirmed" }, orderBy: { startTime: "asc" } },
        },
      },
    },
  });

  // Pricing is per-instructor now — fetch every instructor once, then look
  // each package's own instructor up by id, so a package only ever offers
  // upgrade tiers priced by the same person it was originally bought from.
  const instructorMemberships = await prisma.membership.findMany({
    where: { businessId: business.id, role: { in: ["owner", "instructor"] } },
  });
  const instructorsById = new Map(instructorMemberships.map((m) => [m.id, m]));

  const customers = playerMemberships.map(({ user: p }) => {
    const upgradedFromIds = new Set(p.packages.map((pkg) => pkg.upgradedFromId).filter(Boolean));

    const packages = p.packages.map((pkg) => {
      const instructorMembership = pkg.instructorMembershipId ? instructorsById.get(pkg.instructorMembershipId) : null;
      const upgradeTiers = instructorMembership
        ? enabledPackages(instructorMembership).filter((t) => t.lessons > pkg.lessonsTotal)
        : [];
      return {
        id: pkg.id,
        type: pkg.type,
        label: findPackage(pkg.type)?.label || pkg.type,
        lessonsTotal: pkg.lessonsTotal,
        lessonsRemaining: pkg.lessonsRemaining,
        paymentStatus: pkg.paymentStatus,
        creditCents: pkg.creditCents,
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

    const upcomingLessons = p.bookings.filter(
      (b) => b.serviceType === "lesson" && b.startTime > new Date()
    ).length;

    return {
      id: p.id,
      name: p.name || "—",
      email: p.email,
      phone: p.phone || "—",
      packages,
      fittings,
      totalLessonsRemaining: packages.reduce((sum, pkg) => sum + pkg.lessonsRemaining, 0),
      upcomingLessons,
    };
  });

  return (
    <CustomersClient
      customers={customers}
      slug={params.slug}
      basePath={basePath}
      apiBase={apiBase}
    />
  );
}
