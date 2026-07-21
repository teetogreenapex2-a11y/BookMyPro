import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug, requireMembership, getBusinessInstructors } from "@/lib/tenant";
import { seedInstructorAvailability } from "@/lib/seedAvailability";

export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });
  return NextResponse.json(business);
}

// PATCH /api/{slug}/business  { name?, email?, hours?, lessonRate?, package*Enabled?, package*PriceCents?, fitting*Enabled?, fitting*PriceCents? }
// Owner/instructor only.
export async function PATCH(req: NextRequest, { params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const membership = await requireMembership((session.user as any).id, business.id, ["owner", "instructor"]);
  if (!membership) return NextResponse.json({ error: "Instructor access required" }, { status: 403 });

  const body = await req.json();
  const allowed = [
    "name", "email", "hours", "lessonRate", "instructorName", "paymentProvider",
    "packageSingleEnabled", "packagePlayingEnabled", "packageVideoEnabled", "packageThreeEnabled", "packageFiveEnabled", "packageTenEnabled",
    "packageSinglePriceCents", "packagePlayingPriceCents", "packageVideoPriceCents", "packageThreePriceCents", "packageFivePriceCents", "packageTenPriceCents",
    "fittingDriverEnabled", "fittingIronEnabled", "fittingFullEnabled",
    "fittingDriverPriceCents", "fittingIronPriceCents", "fittingFullPriceCents",
    "allowPayLater", "requireBookingApproval", "calendarProvider", "notifyOnBooking", "notificationEmail",
    "bookingWindowDays", "dailyApiKey",
    "listedInDirectory", "city", "state", "zipCode",
  ];
  const data: Record<string, unknown> = {};
  for (const key of allowed) if (key in body) data[key] = body[key];

  const updated = await prisma.business.update({ where: { id: business.id }, data });

  // If the booking window just got longer, immediately extend every
  // instructor's calendar to match — otherwise the new setting wouldn't
  // actually do anything until each instructor happened to get re-seeded
  // some other way. seedInstructorAvailability uses upsert, so calling it
  // again is safe: existing days are left alone, only the newly-extended
  // range gets real rows created.
  if (typeof data.bookingWindowDays === "number" && data.bookingWindowDays > business.bookingWindowDays) {
    const instructors = await getBusinessInstructors(business.id);
    await Promise.all(instructors.map((inst) => seedInstructorAvailability(business.id, inst.id, data.bookingWindowDays as number)));
  }

  return NextResponse.json(updated);
}
