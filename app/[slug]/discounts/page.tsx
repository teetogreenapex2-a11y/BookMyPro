import { getServerSession } from "next-auth";
import { loginRedirectUrl } from "@/lib/businessUrl";
import { redirect, notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { getBusinessBySlug, getMembership, getBasePaths } from "@/lib/tenant";
import { businessPageMetadata } from "@/lib/pageMetadata";
import DiscountsClient from "./DiscountsClient";

export async function generateMetadata({ params }: { params: { slug: string } }) {
  return businessPageMetadata(params.slug, "Discounts");
}

export default async function DiscountsPage({ params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect(loginRedirectUrl(`/${params.slug}/discounts`));
  const business = await getBusinessBySlug(params.slug);
  if (!business) notFound();
  const me = await getMembership((session.user as any).id, business.id);
  if (!me || (me.role !== "owner" && me.role !== "instructor")) notFound();
  const { basePath } = getBasePaths(params.slug);
  return <DiscountsClient slug={params.slug} basePath={basePath} />;
}
