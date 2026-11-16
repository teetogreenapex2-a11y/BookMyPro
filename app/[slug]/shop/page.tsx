import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { getBusinessBySlug, ensureMembership, getBasePaths } from "@/lib/tenant";
import { businessPageMetadata } from "@/lib/pageMetadata";
import ShopClient from "./ShopClient";

export async function generateMetadata({ params }: { params: { slug: string } }) {
  return businessPageMetadata(params.slug, "Shop");
}

export default async function ShopPage({ params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  const business = await getBusinessBySlug(params.slug);
  if (!business) notFound();

  // Anyone can shop without an account; only signed-in people get a membership.
  if (session) await ensureMembership((session.user as any).id, business.id, "player");
  const { basePath, apiBase } = getBasePaths(params.slug);

  return <ShopClient slug={params.slug} basePath={basePath} apiBase={apiBase} businessName={business.name} signedIn={!!session} />;
}
