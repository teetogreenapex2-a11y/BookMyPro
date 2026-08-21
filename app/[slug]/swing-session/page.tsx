import { getServerSession } from "next-auth";
import { redirect, notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { getBusinessBySlug, requireMembership, getBasePaths } from "@/lib/tenant";
import { loginRedirectUrl } from "@/lib/businessUrl";
import SwingSessionClient from "@/app/components/SwingSessionClient";

export default async function SwingSessionPage({ params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect(loginRedirectUrl(`/${params.slug}/swing-session`));

  const business = await getBusinessBySlug(params.slug);
  if (!business) notFound();

  const membership = await requireMembership((session.user as any).id, business.id, ["owner", "instructor", "player"]);
  if (!membership) notFound();

  const { basePath, apiBase } = getBasePaths(params.slug);
  return <SwingSessionClient slug={params.slug} basePath={basePath} apiBase={apiBase} />;
}
