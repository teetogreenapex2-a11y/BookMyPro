import { getServerSession } from "next-auth";
import { redirect, notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { getBusinessBySlug, requireMembership, getBasePaths } from "@/lib/tenant";
import { loginRedirectUrl } from "@/lib/businessUrl";
import MessagesInboxClient from "./MessagesInboxClient";

export default async function InstructorMessagesPage({ params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect(loginRedirectUrl(`/${params.slug}/instructor/messages`));

  const business = await getBusinessBySlug(params.slug);
  if (!business) notFound();

  const membership = await requireMembership((session.user as any).id, business.id, ["owner", "instructor"]);
  if (!membership) redirect(`/${params.slug}/book`);

  const { apiBase, basePath } = getBasePaths(params.slug);
  return <MessagesInboxClient apiBase={apiBase} basePath={basePath} />;
}
