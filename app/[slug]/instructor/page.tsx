import { getServerSession } from "next-auth";
import { redirect, notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { getBusinessBySlug, requireMembership, getBasePaths } from "@/lib/tenant";
import { hasCalendarConnected } from "@/lib/calendar";
import InstructorClient from "./InstructorClient";

export default async function InstructorPage({ params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
<InstructorClient
      slug={params.slug}
      businessName={business.name}
      businessLogoUrl={business.logoUrl}
      calendarConnected={hasCalendarConnected(business, membership)}
  const business = await getBusinessBySlug(params.slug);
  if (!business) notFound();

  const membership = await requireMembership((session.user as any).id, business.id, ["owner", "instructor"]);
  const { basePath, apiBase } = getBasePaths(params.slug);
  if (!membership) redirect(`${basePath}/book`);

  return (
    
      calendarProvider={business.calendarProvider}
      remoteLessonsEnabled={!!business.dailyApiKey}
      viewerMembershipId={membership.id}
      viewerRole={membership.role}
      basePath={basePath}
      apiBase={apiBase}
    />
  );
}
