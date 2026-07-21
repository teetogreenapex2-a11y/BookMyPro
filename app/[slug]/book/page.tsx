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

  const userId = (session.user as any).id;

  // First time this player interacts with this business, give them a
  // "player" Membership automatically — booking with a new golf pro doesn't
  // require an invite, unlike becoming an owner/instructor.
  await ensureMembership(userId, business.id, "player");

  const packages = await prisma.package.findMany({
    where: { userId, businessId: business.id },
    orderBy: { createdAt: "desc" },
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
      initialPackages={packages}
      business={{ ...businessForClient, instructorName: instructorDisplayName }}
      remoteLessonsEnabled={!!dailyApiKey}
      slug={params.slug}
      basePath={basePath}
      apiBase={apiBase}
    />
  );
}
