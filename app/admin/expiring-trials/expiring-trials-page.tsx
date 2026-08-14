import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { isPlatformAdmin } from "@/lib/tenant";
import ExpiringTrialsClient from "./ExpiringTrialsClient";

export default async function ExpiringTrialsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login?callbackUrl=/admin/expiring-trials");

  const isAdmin = await isPlatformAdmin((session.user as any).id);
  if (!isAdmin) redirect("/");

  return <ExpiringTrialsClient />;
}
