import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug, requireMembership, getMembership } from "@/lib/tenant";

// POST /api/{slug}/notes  { bookingId, text }  — owner/instructor only
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const membership = await requireMembership((session.user as any).id, business.id, ["owner", "instructor"]);
  if (!membership) return NextResponse.json({ error: "Instructor access required" }, { status: 403 });

  const { bookingId, text } = await req.json();

  // Confirm the booking actually belongs to this business before writing a note on it.
  const booking = await prisma.booking.findFirst({ where: { id: bookingId, businessId: business.id } });
  if (!booking) return NextResponse.json({ error: "Booking not found" }, { status: 404 });

  const note = await prisma.note.upsert({
    where: { bookingId },
    update: { text },
    create: { bookingId, text },
  });

  return NextResponse.json(note);
}

// GET /api/{slug}/notes?bookingId=...  — player (own booking) or owner/instructor
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const bookingId = req.nextUrl.searchParams.get("bookingId");
  if (!bookingId) return NextResponse.json({ error: "bookingId required" }, { status: 400 });

  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, businessId: business.id },
    include: { note: true },
  });
  if (!booking) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const userId = (session.user as any).id;
  const membership = await getMembership(userId, business.id);
  const isStaff = membership?.role === "owner" || membership?.role === "instructor";
  if (!isStaff && booking.playerId !== userId) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  return NextResponse.json(booking.note);
}
