import { getServerSession } from "next-auth";
import { redirect, notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { getBusinessBySlug, requireMembership, getBasePaths } from "@/lib/tenant";
import InstructorVideosClient from "./InstructorVideosClient";

import { loginRedirectUrl } from "@/lib/businessUrl";

export default async function InstructorVideosPage({ params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect(loginRedirectUrl(`/${params.slug}/instructor/videos`));

  const business = await getBusinessBySlug(params.slug);
  if (!business) notFound();

  const membership = await requireMembership((session.user as any).id, business.id, ["owner", "instructor"]);
  const { basePath, apiBase } = getBasePaths(params.slug);
  if (!membership) redirect(`${basePath}/book`);

 return <InstructorVideosClient slug={params.slug} basePath={basePath} apiBase={apiBase} viewerMembershipId={membership.id} />;
}
