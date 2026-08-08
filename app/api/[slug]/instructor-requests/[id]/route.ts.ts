import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug, requireMembership } from "@/lib/tenant";

// PATCH /api/{slug}/instructor-requests/{id}  { action: "approve" | "deny" }
// Owner/instructor only. Approving flips the pending membership to active,
// which is the only thing that actually grants real instructor access
// anywhere in the app (see requireMembership() and getBusinessInstructors()
// in lib/tenant.ts, both of which specifically require status === "active").
// Denying removes the request entirely, rather than leaving it around in
// some other state - the person keeps their account, they just don't have
// a membership at this business at all, same as anyone who never applied.
export async function PATCH(req: NextRequest, { params }: { params: { slug: string; id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const membership = await requireMembership((session.user as any).id, business.id, ["owner"]);
  if (!membership) return NextResponse.json({ error: "Owner access required" }, { status: 403 });

  const request_ = await prisma.membership.findUnique({ where: { id: params.id } });
  if (!request_ || request_.businessId !== business.id || request_.status !== "pending") {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }

  const { action } = await req.json();
  if (action === "approve") {
    await prisma.membership.update({ where: { id: params.id }, data: { status: "active" } });
  } else if (action === "deny") {
    await prisma.membership.delete({ where: { id: params.id } });
  } else {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
