import { getServerSession } from "next-auth";
import { loginRedirectUrl } from "@/lib/businessUrl";
import { redirect, notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { getBusinessBySlug, ensureMembership, getBasePaths } from "@/lib/tenant";
import ShopClient from "./ShopClient";

export default async function ShopPage({ params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect(loginRedirectUrl(`/${params.slug}/shop`));

  const business = await getBusinessBySlug(params.slug);
  if (!business) notFound();

  await ensureMembership((session.user as any).id, business.id, "player");
  const { basePath, apiBase } = getBasePaths(params.slug);

  return <ShopClient slug={params.slug} basePath={basePath} apiBase={apiBase} businessName={business.name} />;
}
