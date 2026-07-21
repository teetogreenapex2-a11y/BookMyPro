import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { refreshSquareToken } from "@/lib/square";

// GET /api/cron/square-token-refresh?secret=...
// Square access tokens expire (30 days) and Square explicitly recommends
// refreshing every 7 days or less with monitoring for failed refreshes —
// unlike Stripe Connect, where a connected account's authorization just
// stays valid until revoked. Run this daily.
export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret") || req.headers.get("authorization")?.replace("Bearer ", "");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const soon = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000); // refresh anything expiring within 8 days
  const businesses = await prisma.business.findMany({
    where: {
      paymentProvider: "square",
      squareRefreshToken: { not: null },
      squareTokenExpiresAt: { lt: soon },
    },
  });

  const results = [];
  for (const business of businesses) {
    try {
      const tokens = await refreshSquareToken(business.squareRefreshToken!);
      await prisma.business.update({
        where: { id: business.id },
        data: {
          squareAccessToken: tokens.accessToken,
          squareRefreshToken: tokens.refreshToken,
          squareTokenExpiresAt: tokens.expiresAt,
        },
      });
      results.push({ businessId: business.id, refreshed: true });
    } catch (e: any) {
      console.error(`Square token refresh failed for business ${business.id}:`, e);
      results.push({ businessId: business.id, refreshed: false, error: e?.message });
    }
  }

  return NextResponse.json({ checked: businesses.length, results });
}
