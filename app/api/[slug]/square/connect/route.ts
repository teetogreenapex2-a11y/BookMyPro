import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getBusinessBySlug, requireMembership } from "@/lib/tenant";
import { getSquareAuthUrl } from "@/lib/square";

// GET /api/{slug}/square/connect — owner/instructor only.
// Redirects to Square's OAuth authorization page. Square's callback URL is
// fixed (registered in the Square Developer Dashboard), so — same trick as
// the Google Calendar connect flow — the businessId travels through as the
// OAuth `state` param.
export async function GET(req: Request, { params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const membership = await requireMembership((session.user as any).id, business.id, ["owner", "instructor"]);
  if (!membership) return NextResponse.json({ error: "Instructor access required" }, { status: 403 });

  return NextResponse.redirect(getSquareAuthUrl(business.id));
}
