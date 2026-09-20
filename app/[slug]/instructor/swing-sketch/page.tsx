import { getServerSession } from "next-auth";
import { redirect, notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { getBusinessBySlug, requireMembership, getBasePaths } from "@/lib/tenant";
import { businessPageMetadata } from "@/lib/pageMetadata";
import SwingSketchListClient from "./SwingSketchListClient";

export async function generateMetadata({ params }: { params: { slug: string } }) {
  return businessPageMetadata(params.slug, "Swing Sketches");
}

export default async function SwingSketchListPage({ params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const business = await getBusinessBySlug(params.slug);
  if (!business) notFound();

  const membership = await requireMembership((session.user as any).id, business.id, ["owner", "instructor"]);
  const { basePath, apiBase } = getBasePaths(params.slug);
  if (!membership) redirect(`${basePath}/book`);

  return <SwingSketchListClient slug={params.slug} basePath={basePath} apiBase={apiBase} />;
}
