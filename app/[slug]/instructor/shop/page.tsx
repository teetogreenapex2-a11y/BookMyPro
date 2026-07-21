import { getServerSession } from "next-auth";
import { redirect, notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { getBusinessBySlug, requireMembership, getBasePaths } from "@/lib/tenant";
import InstructorShopClient from "./InstructorShopClient";

export default async function InstructorShopPage({ params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const business = await getBusinessBySlug(params.slug);
  if (!business) notFound();

  const membership = await requireMembership((session.user as any).id, business.id, ["owner"]);
  const { basePath, apiBase } = getBasePaths(params.slug);
  if (!membership) redirect(`${basePath}/book`);

  return <InstructorShopClient slug={params.slug} basePath={basePath} apiBase={apiBase} />;
}
