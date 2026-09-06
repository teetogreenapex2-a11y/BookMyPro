import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getBusinessBySlug, getMembership } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";

// POST /api/{slug}/calendar/disconnect
//
// Clears the signed-in instructor's own stored calendar tokens - calendar
// connection lives per-instructor (on Membership), not business-wide, so
// this only ever disconnects the caller's own calendar, never anyone
// else's. Clears both Google and Outlook fields regardless of which is
// currently the business's active provider, since a full disconnect
// shouldn't leave a stale token from a previous connection behind.
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const membership = await getMembership((session.user as any).id, business.id);
  if (!membership || (membership.role !== "owner" && membership.role !== "instructor")) {
    return NextResponse.json({ error: "Instructor access required" }, { status: 403 });
  }

  await prisma.membership.update({
    where: { id: membership.id },
    data: {
      googleRefreshToken: null,
      outlookAccessToken: null,
      outlookRefreshToken: null,
      outlookTokenExpiresAt: null,
    },
  });

  return NextResponse.json({ success: true });
}
