import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getBusinessBySlug } from "@/lib/tenant";
import { findUsableDiscount } from "@/lib/discounts";
import { tooMany, clientIp } from "@/lib/rateLimit";

// POST /api/{slug}/discounts/check { code, service: "lesson"|"fitting", instructorMembershipId }
// Lets the booking page tell the customer their code works before they pay.
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ ok: false, error: "Sign in required" }, { status: 401 });
  if (tooMany(`dcheck:${clientIp(req)}`, 20, 10 * 60 * 1000)) {
    return NextResponse.json({ ok: false, error: "Too many tries - wait a few minutes" }, { status: 429 });
  }
  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ ok: false, error: "Business not found" }, { status: 404 });
  const { code, service, instructorMembershipId } = await req.json();
  const found = await findUsableDiscount(business.id, code, service === "fitting" ? "fitting" : "lesson", instructorMembershipId || null, { userId: (session.user as any).id, email: session.user?.email });
  if ("error" in found) return NextResponse.json({ ok: false, error: found.error });
  const d = found.discount;
  return NextResponse.json({ ok: true, code: d.code, kind: d.kind, value: d.value });
}
