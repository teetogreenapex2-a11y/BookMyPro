import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { isPlatformAdmin } from "@/lib/tenant";
import BillingClient from "./BillingClient";

export default async function AdminBillingPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login?callbackUrl=/admin/billing");

  const isAdmin = await isPlatformAdmin((session.user as any).id);
  if (!isAdmin) redirect("/");

  return <BillingClient />;
}
