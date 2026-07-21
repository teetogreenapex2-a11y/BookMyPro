import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireMembership, ensureMembership } from "@/lib/tenant";
import { exchangeSquareCode } from "@/lib/square";
import { businessDestination } from "@/lib/businessUrl";

// This route's URL is fixed (registered in the Square Developer Dashboard)
// and can't be per-business — the business id comes back via the `state`
// param that /api/{slug}/square/connect set when it kicked off the OAuth flow.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const code = req.nextUrl.searchParams.get("code");
  const businessId = req.nextUrl.searchParams.get("state");
  const err = req.nextUrl.searchParams.get("error");
  if (err) return NextResponse.json({ error: `Square declined: ${err}` }, { status: 400 });
  if (!code || !businessId) return NextResponse.json({ error: "Missing code or state" }, { status: 400 });

  const business = await prisma.business.findUnique({ where: { id: businessId } });
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const userId = (session.user as any).id;
  await (
    (await requireMembership(userId, business.id, ["owner", "instructor"])) ||
    (await ensureMembership(userId, business.id, "instructor"))
  );

  try {
    const tokens = await exchangeSquareCode(code);
    await prisma.business.update({
      where: { id: business.id },
      data: {
        paymentProvider: "square",
        squareMerchantId: tokens.merchantId,
        squareAccessToken: tokens.accessToken,
        squareRefreshToken: tokens.refreshToken,
        squareTokenExpiresAt: tokens.expiresAt,
      },
    });
  } catch (e) {
    console.error("Square OAuth token exchange failed:", e);
    return NextResponse.redirect(businessDestination(business.slug, "/settings?square=error"));
  }

  return NextResponse.redirect(businessDestination(business.slug, "/settings?square=connected"));
}
