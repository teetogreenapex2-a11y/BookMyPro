import { chargesOnPlatform } from "@/lib/stripe";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { milesBetween } from "@/lib/geocoding";
import { hasLessonsLeft } from "@/lib/personal";

// GET /api/personal/pros?lat=..&lng=..&radius=50   (nearest first)
//  or /api/personal/pros?q=raleigh nc               (text search)
// Instructors a Personal user can send a video to: only approved,
// directory-listed businesses with video turned on, and only instructors
// who are active and not hidden from booking.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const userId = (session.user as any).id as string;
  const q = req.nextUrl.searchParams.get("q")?.trim();
  const lat = req.nextUrl.searchParams.get("lat");
  const lng = req.nextUrl.searchParams.get("lng");
  const radius = Number(req.nextUrl.searchParams.get("radius")) || 50;

  const select = {
    slug: true, name: true, paymentProvider: true, stripeAccountId: true, city: true, state: true, latitude: true, longitude: true,
    memberships: {
      where: { role: { in: ["owner", "instructor"] }, status: "active", hiddenFromBooking: false, isSandboxProspect: false },
      select: { id: true, businessId: true, specialty: true, videoReviewPriceCents: true, user: { select: { name: true } } },
    },
  };
  const base = { listedInDirectory: true, approved: true, videoEnabled: true };

  let list: any[];
  if (lat && lng) {
    const la = parseFloat(lat), ln = parseFloat(lng);
    const rows = await prisma.business.findMany({ where: { ...base, latitude: { not: null }, longitude: { not: null } }, select });
    list = rows
      .map((b) => ({ ...b, distanceMiles: milesBetween(la, ln, b.latitude!, b.longitude!) }))
      .filter((b) => b.distanceMiles <= radius)
      .sort((a, b) => a.distanceMiles - b.distanceMiles)
      .slice(0, 40);
  } else {
    list = await prisma.business.findMany({
      where: {
        ...base,
        ...(q ? {
          AND: q.split(/[,\s]+/).filter(Boolean).map((term) => ({
            OR: [
              { city: { contains: term, mode: "insensitive" as const } },
              { state: { contains: term, mode: "insensitive" as const } },
              { zipCode: { contains: term, mode: "insensitive" as const } },
              { name: { contains: term, mode: "insensitive" as const } },
            ],
          })),
        } : {}),
      },
      select, orderBy: { name: "asc" }, take: 40,
    });
  }

  // Instructors this player still has lesson credits with: review is free.
  const credits = await prisma.package.findMany({
    where: { userId, lessonsRemaining: { gt: 0 }, instructorMembershipId: { not: null } },
    select: { instructorMembershipId: true },
  });
  const covered = new Set(credits.map((c) => c.instructorMembershipId));

  const shaped = list
    .filter((b) => b.memberships.length > 0)
    .map((b) => ({
      slug: b.slug, name: b.name, city: b.city, state: b.state,
      distanceMiles: b.distanceMiles ?? null,
      // A paid review needs a Stripe-connected business; a pro charging
      // for reviews without card payments set up can't be offered yet.
      instructors: b.memberships
        .filter((m: any) => !(m.videoReviewPriceCents > 0) || (b.paymentProvider === "stripe" && (chargesOnPlatform(b as any) || !!b.stripeAccountId)))
        .map((m: any) => ({ id: m.id, name: m.user.name || "Instructor", specialty: m.specialty, priceCents: covered.has(m.id) ? 0 : (m.videoReviewPriceCents || 0), covered: covered.has(m.id) && (m.videoReviewPriceCents || 0) > 0 })),
    }))
    .filter((b) => b.instructors.length > 0);
  return NextResponse.json(shaped);
}
