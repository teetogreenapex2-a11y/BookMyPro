// Converts a city/state/zip into real map coordinates, so Find a Pro can
// do genuine distance-based search instead of exact text matching. Uses
// OpenStreetMap's Nominatim service - free, no API key or signup needed,
// and no restriction on storing the results (unlike Google's geocoding
// API, whose terms don't allow permanently storing coordinates, which
// this app needs to do). This runs rarely - once per business, when they
// save their directory location in Settings - so Nominatim's usage
// policy (a proper User-Agent, roughly one request per second) is easily
// satisfied without any special handling.

export async function geocodeLocation(
  city: string,
  state: string,
  zipCode?: string
): Promise<{ latitude: number; longitude: number } | null> {
  const query = [city, state, zipCode].filter(Boolean).join(", ");
  if (!query.trim()) return null;

  try {
    const params = new URLSearchParams({
      q: query,
      format: "json",
      limit: "1",
      countrycodes: "us",
    });
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
      headers: {
        // Nominatim's usage policy requires identifying the application -
        // this isn't optional, requests without a real User-Agent can get
        // blocked.
        "User-Agent": "BookMyPro (golf lesson booking platform)",
      },
    });
    if (!res.ok) return null;
    const results = await res.json();
    if (!Array.isArray(results) || results.length === 0) return null;

    const { lat, lon } = results[0];
    const latitude = parseFloat(lat);
    const longitude = parseFloat(lon);
    if (isNaN(latitude) || isNaN(longitude)) return null;

    return { latitude, longitude };
  } catch (err) {
    console.error("Geocoding failed:", err);
    return null;
  }
}

// Standard Haversine formula - the well-established way to calculate the
// distance between two points on a sphere given their lat/long. Returns
// miles. No external service needed for this part - it's pure math once
// both points have real coordinates.
export function milesBetween(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8; // Earth's radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
