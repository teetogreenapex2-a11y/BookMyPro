import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getBusinessBySlug, requireMembership } from "@/lib/tenant";
import { getSquareAuthUrl } from "@/lib/square";

// GET /api/{slug}/square/connect
//
// Kicks off the Square OAuth flow - the business id is carried through as
// the `state` param (see getSquareAuthUrl in lib/square.ts) since the
// callback URL is fixed in Square's Developer Dashboard and can't be
// per-business. This route was previously, mistakenly holding a stale,
// duplicate copy of the webhook handler instead - the real one has always
// correctly lived separately at app/api/square/webhook/route.ts.
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.redirect(new URL(`/login?callbackUrl=${encodeURIComponent(req.url)}`, req.url));

  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const membership = await requireMembership((session.user as any).id, business.id, ["owner", "instructor"]);
  if (!membership) return NextResponse.json({ error: "Instructor access required" }, { status: 403 });

  return NextResponse.redirect(getSquareAuthUrl(business.id));
}
