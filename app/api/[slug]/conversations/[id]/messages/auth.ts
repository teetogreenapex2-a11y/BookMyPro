import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug, requireMembership } from "@/lib/tenant";

// Shared by both route.ts (text messages) and upload-token/route.ts
// (image messages) - kept in its own file specifically because a
// route.ts file can only export GET/POST/etc. handlers; any other named
// export from one is rejected at build time.
export async function authorizedMembershipFor(req: NextRequest, slug: string, conversationId: string) {
  const session = await getServerSession(authOptions);
  if (!session) return null;

  const business = await getBusinessBySlug(slug);
  if (!business) return null;

  const membership = await requireMembership((session.user as any).id, business.id, ["owner", "instructor", "player"]);
  if (!membership) return null;

  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conversation || conversation.businessId !== business.id) return null;

  // A player can only ever be in their own conversation - an
  // instructor/owner can see any conversation at this business, since
  // the whole point of one shared thread per player is that anyone on
  // staff can pick it up.
  if (membership.role === "player" && conversation.playerMembershipId !== membership.id) return null;

  return { business, membership, conversation };
}
