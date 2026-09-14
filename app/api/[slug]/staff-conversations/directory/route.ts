import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getBusinessBySlug, requireMembership, getBusinessInstructors } from "@/lib/tenant";

// GET /api/{slug}/staff-conversations/directory
//
// Every other staff member at this business (excluding the caller
// themselves) - for picking who to start a new conversation with.
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const membership = await requireMembership((session.user as any).id, business.id, ["owner", "instructor"]);
  if (!membership) return NextResponse.json({ error: "Staff access required" }, { status: 403 });

  const staff = await getBusinessInstructors(business.id);

  return NextResponse.json(
    staff
      .filter((m) => m.id !== membership.id)
      .map((m) => ({ id: m.id, name: m.user.name || m.user.email, role: m.role }))
  );
}
