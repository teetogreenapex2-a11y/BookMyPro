import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { isPlatformAdmin } from "@/lib/tenant";
import SignupsClient from "./SignupsClient";

export default async function SignupsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login?callbackUrl=/admin/signups");
  if (!(await isPlatformAdmin((session.user as any).id))) redirect("/");
  return <SignupsClient />;
}
