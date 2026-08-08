import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug, requireMembership } from "@/lib/tenant";

// GET /api/{slug}/instructor-requests — owner/instructor only, lists
// anyone currently waiting on approval to join as an instructor.
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const membership = await requireMembership((session.user as any).id, business.id, ["owner"]);
  if (!membership) return NextResponse.json({ error: "Owner access required" }, { status: 403 });

  const pending = await prisma.membership.findMany({
    where: { businessId: business.id, role: "instructor", status: "pending" },
    include: { user: { select: { name: true, email: true } } },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(
    pending.map((m) => ({ id: m.id, name: m.user.name, email: m.user.email, requestedAt: m.createdAt }))
  );
}
