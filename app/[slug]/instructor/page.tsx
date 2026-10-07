import { getServerSession } from "next-auth";
import { loginRedirectUrl } from "@/lib/businessUrl";
import { redirect, notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { getBusinessBySlug, requireMembership, getBasePaths } from "@/lib/tenant";
import { hasCalendarConnected } from "@/lib/calendar";
import { businessPageMetadata } from "@/lib/pageMetadata";
import { prisma } from "@/lib/prisma";
import PhonePrompt from "@/app/components/PhonePrompt";
import InstructorClient from "./InstructorClient";

export async function generateMetadata({ params }: { params: { slug: string } }) {
  return businessPageMetadata(params.slug, "Dashboard");
}

export default async function InstructorPage({ params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect(loginRedirectUrl(`/${params.slug}/instructor`));

  const business = await getBusinessBySlug(params.slug);
  if (!business) notFound();

  const membership = await requireMembership((session.user as any).id, business.id, ["owner", "instructor"]);
  const { basePath, apiBase } = getBasePaths(params.slug);
  if (!membership) redirect(`${basePath}/book`);

  // Owners and instructors who set up before a phone number was required
  // get a pop-up asking for one (see PhonePrompt).
  const profileUser = await prisma.user.findUnique({ where: { id: (session.user as any).id }, select: { phone: true } });
  const needsPhone = !profileUser?.phone || profileUser.phone.replace(/\D/g, "").length < 7;

  return (
    <>
    {needsPhone && <PhonePrompt />}
    <InstructorClient
      slug={params.slug}
      businessName={business.name}
      businessLogoUrl={business.logoUrl}
      calendarConnected={hasCalendarConnected(business, membership)}
      calendarProvider={business.calendarProvider}
      remoteLessonsEnabled={!!business.dailyApiKey}
      viewerMembershipId={membership.id}
      viewerRole={membership.role}
      viewerName={session.user?.name || null}
      basePath={basePath}
      apiBase={apiBase}
      openHour={business.openHour}
      closeHour={business.closeHour}
      timezone={business.timezone}
    />
    </>
  );
}
