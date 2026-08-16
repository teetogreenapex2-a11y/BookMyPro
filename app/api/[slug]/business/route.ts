import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug, requireMembership, getBusinessInstructors } from "@/lib/tenant";
import { seedInstructorAvailability } from "@/lib/seedAvailability";
import { geocodeLocation } from "@/lib/geocoding";

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
    "name", "email", "hours", "openHour", "closeHour", "lessonRate", "instructorName", "paymentProvider",
    "packageSingleEnabled", "packagePlayingEnabled", "packageVideoEnabled", "packageThreeEnabled", "packageFiveEnabled", "packageTenEnabled",
    "packageSinglePriceCents", "packagePlayingPriceCents", "packageVideoPriceCents", "packageThreePriceCents", "packageFivePriceCents", "packageTenPriceCents",
    "fittingDriverEnabled", "fittingIronEnabled", "fittingFullEnabled",
    "fittingDriverPriceCents", "fittingIronPriceCents", "fittingFullPriceCents",
    "allowPayLater", "allowClubBilling", "requireBookingApproval", "calendarProvider", "notifyOnBooking", "notificationEmail", "bookingNotifyTarget",
    "bookingWindowDays", "dailyApiKey",
    "listedInDirectory", "city", "state", "zipCode",
  ];
  const data: Record<string, unknown> = {};
  for (const key of allowed) if (key in body) data[key] = body[key];

  // City/state/zip changed - geocode it so distance-based search actually
  // has something to work with. Runs once here rather than per search,
  // since a business's location doesn't change often.
  if ("city" in data || "state" in data || "zipCode" in data) {
    const city = (data.city as string) || business.city || "";
    const state = (data.state as string) || business.state || "";
    const zipCode = (data.zipCode as string) || business.zipCode || undefined;
    const coords = await geocodeLocation(city, state, zipCode);
    if (coords) {
      data.latitude = coords.latitude;
      data.longitude = coords.longitude;
    }
  }

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

  // Hours changed - re-seed so the calendar picks up any newly-included
  // hours right away (e.g. staying open later now creates those new
  // slots). This is additive only: if hours got narrower, any existing
  // slot outside the new range - especially a booked one - is left
  // exactly as it is rather than being touched or removed automatically.
  if ("openHour" in data || "closeHour" in data) {
    const instructors = await getBusinessInstructors(business.id);
    await Promise.all(instructors.map((inst) => seedInstructorAvailability(business.id, inst.id, business.bookingWindowDays)));
  }

  return NextResponse.json(updated);
}
