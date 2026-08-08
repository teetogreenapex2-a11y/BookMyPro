import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { isPlatformAdmin } from "@/app/api/admin/pending-businesses/route";
import PendingBusinessesClient from "./PendingBusinessesClient";

export default async function PendingBusinessesPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login?callbackUrl=/admin/pending-businesses");

  const isAdmin = await isPlatformAdmin((session.user as any).id);
  if (!isAdmin) redirect("/");

  return <PendingBusinessesClient />;
}
