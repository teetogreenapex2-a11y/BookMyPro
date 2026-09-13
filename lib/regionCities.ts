// The full Research Triangle region, not just the one city the business
// happens to be based in - each of these gets its own real, indexable
// page so the app can genuinely rank for "golf lessons Raleigh" and
// "golf lessons Durham" separately, not just wherever the business
// itself is located. Coordinates are each city's well-known, stable
// center point - hardcoded rather than geocoded live, since a real
// network call to a geocoding service on every single page load would
// be slow and pointless for values that never change.
export type RegionCity = {
  slug: string;
  name: string; // display name, e.g. "Raleigh, NC"
  latitude: number;
  longitude: number;
};

export const REGION_CITIES: RegionCity[] = [
  { slug: "raleigh-nc", name: "Raleigh, NC", latitude: 35.7796, longitude: -78.6382 },
  { slug: "durham-nc", name: "Durham, NC", latitude: 35.9940, longitude: -78.8986 },
  { slug: "chapel-hill-nc", name: "Chapel Hill, NC", latitude: 35.9132, longitude: -79.0558 },
  { slug: "cary-nc", name: "Cary, NC", latitude: 35.7915, longitude: -78.7811 },
  { slug: "apex-nc", name: "Apex, NC", latitude: 35.7327, longitude: -78.8503 },
  { slug: "morrisville-nc", name: "Morrisville, NC", latitude: 35.8235, longitude: -78.8256 },
  { slug: "holly-springs-nc", name: "Holly Springs, NC", latitude: 35.6513, longitude: -78.8336 },
  { slug: "fuquay-varina-nc", name: "Fuquay-Varina, NC", latitude: 35.5849, longitude: -78.8003 },
  { slug: "wake-forest-nc", name: "Wake Forest, NC", latitude: 35.9799, longitude: -78.5097 },
  { slug: "garner-nc", name: "Garner, NC", latitude: 35.7113, longitude: -78.6142 },
  { slug: "clayton-nc", name: "Clayton, NC", latitude: 35.6507, longitude: -78.4561 },
  { slug: "chatham-county-nc", name: "Pittsboro & Chatham County, NC", latitude: 35.7185, longitude: -79.1770 },
];

export function getRegionCity(slug: string): RegionCity | undefined {
  return REGION_CITIES.find((c) => c.slug === slug);
}
