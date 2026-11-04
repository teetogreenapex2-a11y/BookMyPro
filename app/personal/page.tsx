import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import PersonalClient from "./PersonalClient";

export const metadata = { title: "BookMyPro Personal - your swing video library" };

export default async function PersonalPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login?callbackUrl=%2Fpersonal");
  return <PersonalClient />;
}
