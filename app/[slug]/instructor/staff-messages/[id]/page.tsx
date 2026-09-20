import { getServerSession } from "next-auth";
import { redirect, notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug, requireMembership, getBasePaths } from "@/lib/tenant";
import { loginRedirectUrl } from "@/lib/businessUrl";
import { businessPageMetadata } from "@/lib/pageMetadata";
import ChatThread from "@/app/components/ChatThread";

export async function generateMetadata({ params }: { params: { slug: string; id: string } }) {
  return businessPageMetadata(params.slug, "Staff Messages");
}

export default async function StaffConversationPage({ params }: { params: { slug: string; id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect(loginRedirectUrl(`/${params.slug}/instructor/staff-messages/${params.id}`));

  const business = await getBusinessBySlug(params.slug);
  if (!business) notFound();

  const membership = await requireMembership((session.user as any).id, business.id, ["owner", "instructor"]);
  if (!membership) redirect(`/${params.slug}/book`);

  const conversation = await prisma.staffConversation.findUnique({
    where: { id: params.id },
    include: {
      memberA: { include: { user: { select: { name: true, email: true } } } },
      memberB: { include: { user: { select: { name: true, email: true } } } },
    },
  });
  if (!conversation || conversation.businessId !== business.id) notFound();
  if (conversation.memberAId !== membership.id && conversation.memberBId !== membership.id) notFound();

  const other = conversation.memberAId === membership.id ? conversation.memberB : conversation.memberA;
  const otherName = other.user.name || other.user.email;

  const { apiBase, basePath } = getBasePaths(params.slug);

  return (
    <ChatThread
      apiBase={apiBase}
      conversationId={conversation.id}
      title={otherName}
      backHref={`${basePath}/instructor/staff-messages`}
      endpointBase="staff-conversations"
      supportsImages={false}
    />
  );
}
