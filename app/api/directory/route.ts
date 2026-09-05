import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { milesBetween } from "@/lib/geocoding";

// GET /api/directory?q=chapel+hill
//   or  ?lat=35.9&lng=-79.0&radius=50
// Public, no auth required - this is the whole point of a discovery
// directory. Only returns businesses that have explicitly opted in via
// listedInDirectory.
//
// Two search modes: if lat/lng are provided (from the browser's own
// location, or geocoded from a typed search), results are filtered to
// the given radius (default 50 miles) and sorted nearest-first - a real
// distance search, not just text matching. Falls back to the original
// text search against city/state/zip/name if no coordinates are given,
// for businesses that haven't been geocoded yet or players who'd rather
// just type a city name.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  const lat = req.nextUrl.searchParams.get("lat");
  const lng = req.nextUrl.searchParams.get("lng");
  const radiusMiles = Number(req.nextUrl.searchParams.get("radius")) || 50;

  const baseSelect = {
    slug: true,
    name: true,
    city: true,
    state: true,
    latitude: true,
    longitude: true,
    memberships: {
      where: { role: { in: ["owner", "instructor"] } },
      select: { specialty: true, user: { select: { name: true } } },
    },
  };

  if (lat && lng) {
    const searchLat = parseFloat(lat);
    const searchLng = parseFloat(lng);

    const businesses = await prisma.business.findMany({
      where: { listedInDirectory: true, latitude: { not: null }, longitude: { not: null } },
      select: baseSelect,
    });

    const withDistance = businesses
      .map((b) => ({
        ...b,
        distanceMiles: milesBetween(searchLat, searchLng, b.latitude!, b.longitude!),
      }))
      .filter((b) => b.distanceMiles <= radiusMiles)
      .sort((a, b) => a.distanceMiles - b.distanceMiles)
      .slice(0, 50);

    return NextResponse.json(withDistance);
  }

  const businesses = await prisma.business.findMany({
    where: {
      listedInDirectory: true,
      ...(q
        ? {
            OR: [
              { city: { contains: q, mode: "insensitive" } },
              { state: { contains: q, mode: "insensitive" } },
              { zipCode: { contains: q, mode: "insensitive" } },
              { name: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    select: baseSelect,
    orderBy: { name: "asc" },
    take: 50,
  });

  return NextResponse.json(businesses);
}
