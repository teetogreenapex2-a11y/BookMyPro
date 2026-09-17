import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug } from "@/lib/tenant";

// GET /api/{slug}/reviews  - public, used on instructor bio / directory to
// show a star rating + count. No auth needed to read these.
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const reviews = await prisma.review.findMany({
    where: { businessId: business.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, rating: true, text: true, createdAt: true, instructorMembershipId: true, player: { select: { name: true } } },
  });

  return NextResponse.json({ reviews });
}

// POST /api/{slug}/reviews  { bookingId, rating, text? }
//
// Only the player on that exact booking can review it, only once it's
// actually happened, and only once - enforced three ways: the booking
// lookup is scoped to this player's own id, startTime must be in the
// past, and the unique constraint on Review.bookingId makes a second
// attempt fail at the database level even if two requests race.
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const { bookingId, rating, text } = await req.json();
  const ratingNum = Number(rating);
  if (!bookingId || !Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
    return NextResponse.json({ error: "A booking and a 1-5 rating are required" }, { status: 400 });
  }

  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, businessId: business.id, playerId: (session.user as any).id },
  });
  if (!booking) return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  if (booking.status === "cancelled") return NextResponse.json({ error: "That booking was cancelled" }, { status: 400 });
  if (booking.startTime > new Date()) return NextResponse.json({ error: "That lesson hasn't happened yet" }, { status: 400 });
  if (!booking.instructorMembershipId) return NextResponse.json({ error: "No instructor on this booking to review" }, { status: 400 });

  const existing = await prisma.review.findUnique({ where: { bookingId } });
  if (existing) return NextResponse.json({ error: "Already reviewed" }, { status: 400 });

  const review = await prisma.review.create({
    data: {
      businessId: business.id,
      instructorMembershipId: booking.instructorMembershipId,
      playerId: booking.playerId,
      bookingId: booking.id,
      rating: ratingNum,
      text: text?.trim() || null,
    },
  });

  return NextResponse.json(review, { status: 201 });
}
