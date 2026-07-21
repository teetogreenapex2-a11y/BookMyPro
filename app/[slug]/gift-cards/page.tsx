import { getServerSession } from "next-auth";
import { redirect, notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { getBusinessBySlug, ensureMembership, getBasePaths } from "@/lib/tenant";
import GiftCardsClient from "./GiftCardsClient";

export default async function GiftCardsPage({ params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const business = await getBusinessBySlug(params.slug);
  if (!business) notFound();

  await ensureMembership((session.user as any).id, business.id, "player");
  const { basePath, apiBase } = getBasePaths(params.slug);

  return <GiftCardsClient slug={params.slug} basePath={basePath} apiBase={apiBase} businessName={business.name} />;
}
