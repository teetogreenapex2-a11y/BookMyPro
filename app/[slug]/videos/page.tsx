import { getServerSession } from "next-auth";
import { redirect, notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { getBusinessBySlug, ensureMembership, getBasePaths } from "@/lib/tenant";
import VideosClient from "./VideosClient";

export default async function VideosPage({ params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const business = await getBusinessBySlug(params.slug);
  if (!business) notFound();

  const userId = (session.user as any).id;
  await ensureMembership(userId, business.id, "player");

  const { basePath, apiBase } = getBasePaths(params.slug);

  return <VideosClient slug={params.slug} basePath={basePath} apiBase={apiBase} />;
}
