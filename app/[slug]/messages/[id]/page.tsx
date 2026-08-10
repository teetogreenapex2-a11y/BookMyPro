import { getServerSession } from "next-auth";
import { redirect, notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug, requireMembership, getBasePaths } from "@/lib/tenant";
import { loginRedirectUrl } from "@/lib/businessUrl";
import ChatThread from "@/app/components/ChatThread";

export default async function InstructorConversationPage({ params }: { params: { slug: string; id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect(loginRedirectUrl(`/${params.slug}/instructor/messages/${params.id}`));

  const business = await getBusinessBySlug(params.slug);
  if (!business) notFound();

  const membership = await requireMembership((session.user as any).id, business.id, ["owner", "instructor"]);
  if (!membership) redirect(`/${params.slug}/book`);

  const conversation = await prisma.conversation.findUnique({
    where: { id: params.id },
    include: { playerMembership: { include: { user: { select: { name: true, email: true } } } } },
  });
  if (!conversation || conversation.businessId !== business.id) notFound();

  const { apiBase, basePath } = getBasePaths(params.slug);
  const playerName = conversation.playerMembership.user.name || conversation.playerMembership.user.email;

  return <ChatThread apiBase={apiBase} conversationId={conversation.id} title={playerName} backHref={`${basePath}/instructor/messages`} />;
}
