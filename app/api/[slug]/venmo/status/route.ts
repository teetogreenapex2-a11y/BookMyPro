import { NextRequest, NextResponse } from "next/server";
import { getBusinessBySlug } from "@/lib/tenant";
import { findVenmoPayee } from "@/lib/venmoCheckout";

// GET /api/{slug}/venmo/status?instructor=<membershipId>
// Tells the pay screens whether to offer "Pay with Venmo" (someone has a handle saved).
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ available: false });
  const payee = await findVenmoPayee(business.id, req.nextUrl.searchParams.get("instructor"));
  return NextResponse.json({ available: !!payee });
}
