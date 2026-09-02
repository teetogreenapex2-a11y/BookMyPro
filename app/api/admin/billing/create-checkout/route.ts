import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isPlatformAdmin } from "@/lib/tenant";
import { createPlatformCheckoutSession } from "@/lib/stripe";

// POST /api/admin/billing/create-checkout  { businessId, tier: "monthly" | "academy", instructorCount? }
//
// Admin-only - generates a real, working Stripe Checkout link for a
// business's own BookMyPro subscription (not their players' payments to
// them - see the "Platform billing" section in lib/stripe.ts for why
// that's a genuinely separate thing). The link itself is meant to be
// copied and sent directly to the business owner, who completes their
// own checkout with Stripe directly - nothing about their card ever
// passes through this app or through you.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const isAdmin = await isPlatformAdmin((session.user as any).id);
  if (!isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const { businessId, tier, instructorCount } = await req.json();
  if (tier !== "monthly" && tier !== "academy") {
    return NextResponse.json({ error: "Invalid tier" }, { status: 400 });
  }

  const business = await prisma.business.findUnique({ where: { id: businessId } });
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const count = tier === "academy" ? parseInt(instructorCount, 10) : 1;
  if (tier === "academy" && (!Number.isInteger(count) || count < 1)) {
    return NextResponse.json({ error: "Enter a valid number of instructors" }, { status: 400 });
  }

  const url = await createPlatformCheckoutSession(business, tier, count);
  return NextResponse.json({ url });
}
