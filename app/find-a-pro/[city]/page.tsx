import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { milesBetween } from "@/lib/geocoding";
import { REGION_CITIES, getRegionCity } from "@/lib/regionCities";
import FindProSearch from "@/app/components/FindProSearch";

const RADIUS_MILES = 30;

export function generateStaticParams() {
  return REGION_CITIES.map((c) => ({ city: c.slug }));
}

export function generateMetadata({ params }: { params: { city: string } }): Metadata {
  const city = getRegionCity(params.city);
  if (!city) return {};
  const title = `Golf Lessons & Club Fitting in ${city.name} | BookMyPro`;
  const description = `Find golf instructors and club fitting near ${city.name}. Book lessons directly with local PGA professionals through BookMyPro.`;
  return {
    title,
    description,
    alternates: { canonical: `https://bookmypro.app/find-a-pro/${city.slug}` },
    openGraph: { title, description },
  };
}

async function getNearbyBusinesses(lat: number, lng: number) {
  const businesses = await prisma.business.findMany({
    where: { listedInDirectory: true, latitude: { not: null }, longitude: { not: null } },
    select: {
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
    },
  });

  return businesses
    .map((b) => ({ ...b, distanceMiles: milesBetween(lat, lng, b.latitude!, b.longitude!) }))
    .filter((b) => b.distanceMiles <= RADIUS_MILES)
    .sort((a, b) => a.distanceMiles - b.distanceMiles);
}

export default async function CityFindProPage({ params }: { params: { city: string } }) {
  const city = getRegionCity(params.city);
  if (!city) notFound();

  const businesses = await getNearbyBusinesses(city.latitude, city.longitude);
  const otherCities = REGION_CITIES.filter((c) => c.slug !== city.slug);

  return (
    <div style={{ minHeight: "100vh", background: "#F6F4EE", fontFamily: "sans-serif" }}>
      <header style={{ background: "#1B3A2F", color: "#F6F4EE", padding: "32px 20px" }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <img src="/logo.jpg" alt="" style={{ width: 36, height: 36, borderRadius: 8, objectFit: "cover", marginBottom: 8 }} />
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: "#B8862B", marginBottom: 10 }}>BOOKMYPRO</div>
          <h1 style={{ fontSize: 26, margin: "0 0 8px" }}>Golf Lessons &amp; Club Fitting in {city.name}</h1>
          <p style={{ fontSize: 14, color: "#D7DED9", margin: 0 }}>
            Book directly with local instructors and club fitters near {city.name.split(",")[0]} - no phone tag, real open times on their actual calendar.
          </p>
        </div>
      </header>

      <main style={{ maxWidth: 720, margin: "0 auto", padding: "24px 20px 60px" }}>
        {businesses.length > 0 ? (
          <>
            <h2 style={{ fontSize: 16, color: "#1B3A2F", marginBottom: 12 }}>
              {businesses.length} pro{businesses.length === 1 ? "" : "s"} near {city.name.split(",")[0]}
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 32 }}>
              {businesses.map((b) => (
                <a
                  key={b.slug}
                  href={`/${b.slug}/book`}
                  style={{ display: "block", background: "#FFF", border: "1px solid #E3D9C9", borderRadius: 12, padding: 16, textDecoration: "none", color: "inherit" }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: "#1B3A2F", marginBottom: 4 }}>{b.name}</div>
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: "#8A8571", whiteSpace: "nowrap" }}>
                      {b.distanceMiles < 1 ? "less than 1 mi" : `${Math.round(b.distanceMiles)} mi`}
                    </span>
                  </div>
                  {(b.city || b.state) && (
                    <div style={{ fontSize: 12.5, color: "#8A8571", marginBottom: 8 }}>
                      {[b.city, b.state].filter(Boolean).join(", ")}
                    </div>
                  )}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {b.memberships.map((m, i) => (
                      <span key={i} style={{ fontSize: 11.5, background: "#E3D9C9", borderRadius: 20, padding: "3px 10px" }}>
                        {m.user.name || "Instructor"}{m.specialty ? ` - ${m.specialty}` : ""}
                      </span>
                    ))}
                  </div>
                </a>
              ))}
            </div>
          </>
        ) : (
          <div style={{ background: "#FFF", border: "1px solid #E3D9C9", borderRadius: 12, padding: 20, marginBottom: 32 }}>
            <p style={{ fontSize: 14, color: "#3A4038", margin: "0 0 8px" }}>
              New instructors are joining BookMyPro in the {city.name.split(",")[0]} area regularly - check back soon, or search a wider radius below.
            </p>
          </div>
        )}

        <div style={{ background: "#FFF", border: "1px solid #E3D9C9", borderRadius: 12, padding: 20, marginBottom: 32 }}>
          <h2 style={{ fontSize: 15, color: "#1B3A2F", marginBottom: 10 }}>
            What to expect from a lesson or fitting
          </h2>
          <p style={{ fontSize: 13.5, lineHeight: 1.7, color: "#3A4038", margin: 0 }}>
            Instructors on BookMyPro set their own pricing and availability, so you can see real open times and book directly - no waiting on a callback.
            Many also offer club fitting sessions using tools like Trackman launch monitors, so you can see actual ball flight and swing data before
            deciding on new equipment. Whether you're brand new to the game or looking to fine-tune your swing, browsing profiles here lets you pick
            someone whose specialty matches what you're working on.
          </p>
        </div>

        <div style={{ marginBottom: 16 }}>
          <h2 style={{ fontSize: 15, color: "#1B3A2F", marginBottom: 10 }}>Search a specific location instead</h2>
          <FindProSearch />
        </div>

        <div>
          <h2 style={{ fontSize: 13, color: "#8A8571", marginBottom: 10 }}>Other areas we serve</h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {otherCities.map((c) => (
              <a
                key={c.slug}
                href={`/find-a-pro/${c.slug}`}
                style={{ fontSize: 12.5, color: "#1B3A2F", background: "#FFF", border: "1px solid #E3D9C9", borderRadius: 20, padding: "6px 12px", textDecoration: "none" }}
              >
                {c.name}
              </a>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
