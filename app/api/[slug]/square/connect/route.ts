import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getBusinessBySlug, requireMembership } from "@/lib/tenant";
import { getSquareAuthUrl } from "@/lib/square";

// GET /api/{slug}/square/connect — kicks off Square's OAuth flow. The
// callback URL is fixed (registered in the Square Developer Dashboard), so
// the business id travels through as the OAuth `state` param instead - same
// pattern as the Google Calendar connect flow. See
// app/api/square/callback/route.ts, which reads that `state` back.
//
// NOTE: this file previously contained a stray copy of the Square webhook
// handler (the real one lives at app/api/square/webhook/route.ts, the fixed
// URL actually registered with Square) - that leftover meant this route had
// no GET handler at all, so "Connect Square" / "Reconnect" in Settings
// silently failed.
export async function GET(req: Request, { params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const membership = await requireMembership((session.user as any).id, business.id, ["owner", "instructor"]);
  if (!membership) return NextResponse.json({ error: "Instructor access required" }, { status: 403 });

  return NextResponse.redirect(getSquareAuthUrl(business.id));
}
