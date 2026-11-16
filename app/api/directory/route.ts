import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { milesBetween, geocodeLocation } from "@/lib/geocoding";

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
  const radiusMiles = Number(req.nextUrl.searchParams.get("radius")) || 100;

  const baseSelect = {
    slug: true,
    name: true,
    city: true,
    state: true,
    latitude: true,
    longitude: true,
    memberships: {
      where: { role: { in: ["owner", "instructor"] }, hiddenFromBooking: false },
      select: { specialty: true, user: { select: { name: true } } },
    },
  };

  // A typed place name ("Raleigh", "Cary NC", a zip) is turned into real
  // coordinates first, so it finds every pro within the radius - not just
  // ones whose saved city text happens to match what was typed. If it
  // can't be located, the text search below still runs as before.
  let coords: { latitude: number; longitude: number } | null = null;
  if (lat && lng) {
    coords = { latitude: parseFloat(lat), longitude: parseFloat(lng) };
  } else if (q) {
    coords = await geocodeLocation(q, "").catch(() => null);
  }

  if (coords) {
    const searchLat = coords.latitude;
    const searchLng = coords.longitude;

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

    // A typed search that finds nothing nearby still gets the old text
    // match (for a business name, say) instead of an empty list.
    if (withDistance.length > 0 || !q) return NextResponse.json(withDistance);
  }

  const businesses = await prisma.business.findMany({
    where: {
      listedInDirectory: true,
      ...(q
        ? {
            // Split on commas/whitespace so "Raleigh, NC" or "Raleigh NC"
            // works correctly - previously the whole typed string was
            // only ever checked as one single substring against each
            // field, so a combined city+state search could never match
            // anything at all, since no single field actually contains
            // literal text like "Raleigh, NC".
            AND: q
              .split(/[,\s]+/)
              .filter(Boolean)
              .map((term) => ({
                OR: [
                  { city: { contains: term, mode: "insensitive" as const } },
                  { state: { contains: term, mode: "insensitive" as const } },
                  { zipCode: { contains: term, mode: "insensitive" as const } },
                  { name: { contains: term, mode: "insensitive" as const } },
                ],
              })),
          }
        : {}),
    },
    select: baseSelect,
    orderBy: { name: "asc" },
    take: 50,
  });

  return NextResponse.json(businesses);
}
