import { getServerSession } from "next-auth";
import { redirect, notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { getBusinessBySlug, requireMembership, getBasePaths } from "@/lib/tenant";
import { businessPageMetadata } from "@/lib/pageMetadata";
import VisitorsClient from "./VisitorsClient";

export async function generateMetadata({ params }: { params: { slug: string } }) {
  return businessPageMetadata(params.slug, "Visitors");
}

export default async function VisitorsPage({ params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  const business = await getBusinessBySlug(params.slug);
  if (!business) notFound();
  const membership = await requireMembership((session.user as any).id, business.id, ["owner"]);
  const { basePath, apiBase } = getBasePaths(params.slug);
  if (!membership) redirect(`${basePath}/book`);
  return <VisitorsClient basePath={basePath} apiBase={apiBase} />;
}
