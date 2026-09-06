import { getServerSession } from "next-auth";
import { redirect, notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { getBusinessBySlug, getMembership, getBasePaths } from "@/lib/tenant";
import ReportsClient from "./ReportsClient";

export default async function ReportsPage({ params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const business = await getBusinessBySlug(params.slug);
  if (!business) notFound();

  const membership = await getMembership((session.user as any).id, business.id);
  if (!membership || (membership.role !== "owner" && membership.role !== "instructor")) {
    redirect(`/${params.slug}/book`);
  }

  const { basePath, apiBase } = getBasePaths(params.slug);

  return (
    <ReportsClient
      businessName={business.name}
      isOwner={membership.role === "owner"}
      basePath={basePath}
      apiBase={apiBase}
    />
  );
}
