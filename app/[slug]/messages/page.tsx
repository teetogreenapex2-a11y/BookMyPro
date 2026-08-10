import { getServerSession } from "next-auth";
import { redirect, notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug, requireMembership, getBasePaths } from "@/lib/tenant";
import { loginRedirectUrl } from "@/lib/businessUrl";
import ChatThread from "@/app/components/ChatThread";

export default async function MessagesPage({ params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect(loginRedirectUrl(`/${params.slug}/messages`));

  const business = await getBusinessBySlug(params.slug);
  if (!business) notFound();

  const userId = (session.user as any).id;
  const membership = await requireMembership(userId, business.id, ["player"]);
  if (!membership) redirect(`/${params.slug}/book`);

  // Created here, the first time a player ever opens this page - there's
  // only ever one conversation a player would have with a given business,
  // so there's no separate "start a chat" step to walk them through.
  const conversation = await prisma.conversation.upsert({
    where: { businessId_playerMembershipId: { businessId: business.id, playerMembershipId: membership.id } },
    update: {},
    create: { businessId: business.id, playerMembershipId: membership.id },
  });

  const { apiBase, basePath } = getBasePaths(params.slug);

  return <ChatThread apiBase={apiBase} conversationId={conversation.id} title={business.name} backHref={`${basePath}/book`} />;
}
