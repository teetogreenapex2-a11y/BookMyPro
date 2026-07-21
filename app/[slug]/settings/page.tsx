import { getServerSession } from "next-auth";
import { redirect, notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug, getMembership, getBasePaths } from "@/lib/tenant";
import SettingsClient from "./SettingsClient";

export default async function SettingsPage({ params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const business = await getBusinessBySlug(params.slug);
  if (!business) notFound();

  const userId = (session.user as any).id;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  const membership = await getMembership(userId, business.id);
  const isInstructor = membership?.role === "owner" || membership?.role === "instructor";
  const isOwner = membership?.role === "owner";
  const { basePath, apiBase } = getBasePaths(params.slug);

  return (
    <SettingsClient
      user={user!}
      business={business}
      isInstructor={isInstructor}
      isOwner={isOwner}
      slug={params.slug}
      basePath={basePath}
      apiBase={apiBase}
    />
  );
}
