import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { isPlatformAdmin } from "@/lib/tenant";
import FeaturesClient from "./FeaturesClient";

export default async function AdminFeaturesPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login?callbackUrl=/admin/features");
  const isAdmin = await isPlatformAdmin((session.user as any).id);
  if (!isAdmin) redirect("/");
  return <FeaturesClient />;
}
