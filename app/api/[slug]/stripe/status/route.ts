import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getBusinessBySlug, requireMembership } from "@/lib/tenant";
import { getAccountStatus } from "@/lib/stripe";

// GET /api/{slug}/stripe/status — used by Settings to show whether payments
// are actually ready to accept money yet (an Express account can exist
// without onboarding being complete).
export async function GET(req: Request, { params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const membership = await requireMembership((session.user as any).id, business.id, ["owner", "instructor"]);
  if (!membership) return NextResponse.json({ error: "Instructor access required" }, { status: 403 });

  if (!business.stripeAccountId) {
    return NextResponse.json({ connected: false, chargesEnabled: false });
  }

  const status = await getAccountStatus(business.stripeAccountId);
  return NextResponse.json({ connected: true, ...status });
}
