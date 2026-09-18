import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug, getMembership } from "@/lib/tenant";

// GET /api/{slug}/sandbox-links
//
// Owner-only. Lists the sandbox invite links generated for this business
// (via the instructors/{id}/sandbox-link and players/{id}/sandbox-link
// routes), most recent first, so the owner can see who's actually opened
// the link they were emailed and when - or that it's still sitting
// unopened. Never returns the token or sessionToken themselves; those
// are still-valid credentials for anyone who hasn't redeemed them yet,
// and nothing outside the redeem flow needs to see them.
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const requesterMembership = await getMembership((session.user as any).id, business.id);
  if (requesterMembership?.role !== "owner") {
    return NextResponse.json({ error: "Only the owner can view sandbox link activity" }, { status: 403 });
  }

  const links = await prisma.nativeAuthHandoff.findMany({
    where: { businessId: business.id },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      recipientName: true,
      recipientRole: true,
      createdAt: true,
      expiresAt: true,
      redeemedAt: true,
    },
  });

  return NextResponse.json(links);
}
