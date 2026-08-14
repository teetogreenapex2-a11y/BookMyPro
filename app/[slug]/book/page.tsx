import { getServerSession } from "next-auth";
import { redirect, notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug, ensureMembership, getBasePaths } from "@/lib/tenant";
import BookingClient from "./BookingClient";

export default async function BookPage({ params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const business = await getBusinessBySlug(params.slug);
  if (!business) notFound();
  // A self-onboarded business that hasn't been approved yet shouldn't be
  // able to accept real bookings just because someone has the direct
  // link - notFound() here rather than a special message, since telling
  // an outsider "this business exists but isn't approved yet" reveals
  // more than they need to know.
  if (!business.approved) notFound();

  const userId = (session.user as any).id;

  // First time this player interacts with this business, give them a
  // "player" Membership automatically — booking with a new golf pro doesn't
  // require an invite, unlike becoming an owner/instructor.
  await ensureMembership(userId, business.id, "player");

  const packages = await prisma.package.findMany({
    where: { userId, businessId: business.id },
    orderBy: { createdAt: "desc" },
  });

  // Same reasoning as the instructor's own customer list: the stored
  // count still decrements the moment a lesson is booked (that's what
  // actually prevents booking more than what's been paid for), but what
  // a player sees here adds back any upcoming, not-yet-happened lesson
  // so the number doesn't visibly drop until that lesson's own time has
  // genuinely passed.
  const now = new Date();
  const lessonBookings = await prisma.booking.findMany({
    where: { playerId: userId, businessId: business.id, serviceType: "lesson", status: "confirmed", startTime: { gt: now }, packageId: { not: null } },
    select: { packageId: true },
  });
  const upcomingCountByPackage = new Map<string, number>();
  for (const b of lessonBookings) {
    if (!b.packageId) continue;
    upcomingCountByPackage.set(b.packageId, (upcomingCountByPackage.get(b.packageId) || 0) + 1);
  }
  const packagesForClient = packages.map((pkg) => {
    const upcoming = upcomingCountByPackage.get(pkg.id) || 0;
    return { ...pkg, rawLessonsRemaining: pkg.lessonsRemaining, lessonsRemaining: Math.min(pkg.lessonsRemaining + upcoming, pkg.lessonsTotal) };
  });

  // If the business hasn't set a custom "Instructor name" in Settings yet,
  // fall back to the actual signed-in instructor/owner's account name, so
  // players always see who they're booking with rather than nothing at all.
  let instructorDisplayName = business.instructorName;
  if (!instructorDisplayName) {
    const instructorMembership = await prisma.membership.findFirst({
      where: { businessId: business.id, role: { in: ["owner", "instructor"] } },
      include: { user: { select: { name: true } } },
    });
    instructorDisplayName = instructorMembership?.user.name || null;
  }

  const { basePath, apiBase } = getBasePaths(params.slug);

  // dailyApiKey is a secret — never send it to a player's browser. They
  // only need to know remote lessons are available, not the key itself.
  const { dailyApiKey, ...businessForClient } = business;

  return (
    <BookingClient
      initialPackages={packagesForClient}
      business={{ ...businessForClient, instructorName: instructorDisplayName }}
      remoteLessonsEnabled={!!dailyApiKey}
      slug={params.slug}
      basePath={basePath}
      apiBase={apiBase}
    />
  );
}
