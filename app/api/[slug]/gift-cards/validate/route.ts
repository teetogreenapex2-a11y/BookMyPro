import { NextRequest, NextResponse } from "next/server";
import { getBusinessBySlug } from "@/lib/tenant";
import { findRedeemableGiftCard } from "@/lib/giftCards";

// POST /api/{slug}/gift-cards/validate  { code }
// Read-only check — does not redeem anything, just confirms the code is
// real and shows the balance, so a checkout screen can show "applying
// $40 from your gift card" before the person commits to paying.
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const { code } = await req.json();
  if (!code?.trim()) return NextResponse.json({ error: "Enter a gift card code" }, { status: 400 });

  const giftCard = await findRedeemableGiftCard(business.id, code);
  if (!giftCard) return NextResponse.json({ error: "That code isn't valid, or the card has no balance left" }, { status: 404 });

  return NextResponse.json({ code: giftCard.code, remainingValueCents: giftCard.remainingValueCents });
}
