import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getBusinessBySlug, getBusinessInstructors } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import Image from "next/image";

// Bios and photos can change at any time, so this needs to render fresh
// on every request - without this, Next.js could statically cache the
// page (since nothing else here signals dynamic behavior), silently
// serving a stale snapshot from before someone's latest photo upload.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const business = await getBusinessBySlug(params.slug);
  if (!business) return {};
  return { title: `Meet Our Instructors | ${business.name}` };
}

export default async function InstructorsPage({ params }: { params: { slug: string } }) {
  const business = await getBusinessBySlug(params.slug);
  if (!business) notFound();

  const staff = await getBusinessInstructors(business.id);
  const withBios = staff.filter((m) => !m.hiddenFromBooking);

  // One aggregate per instructor, not one for the whole business - the
  // page shows (and Google's structured-data rules require showing)
  // a rating next to the specific person it's about, not a blended
  // business-wide number sitting next to each individual bio.
  const ratingRows = await prisma.review.groupBy({
    by: ["instructorMembershipId"],
    where: { businessId: business.id },
    _avg: { rating: true },
    _count: { rating: true },
  });
  const ratingsByMembership = new Map(
    ratingRows.map((r) => [r.instructorMembershipId, { avg: r._avg.rating || 0, count: r._count.rating }])
  );

  // Structured data only for instructors who actually have at least one
  // real review - Google's guidelines explicitly disallow publishing a
  // rating with zero reviews behind it, so nothing gets a default or
  // placeholder value here.
  const jsonLd = withBios
    .filter((m) => ratingsByMembership.has(m.id))
    .map((m) => {
      const rating = ratingsByMembership.get(m.id)!;
      return {
        "@context": "https://schema.org",
        "@type": "Service",
        name: `Golf lessons with ${m.user.name || "instructor"}`,
        provider: { "@type": "LocalBusiness", name: business.name },
        aggregateRating: {
          "@type": "AggregateRating",
          ratingValue: rating.avg.toFixed(1),
          reviewCount: rating.count,
        },
      };
    });

  return (
    <div style={{ minHeight: "100vh", background: "#F6F4EE", fontFamily: "sans-serif" }}>
      {jsonLd.map((entry, i) => (
        <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(entry) }} />
      ))}
      <header style={{ background: "#1B3A2F", color: "#F6F4EE", padding: "28px 20px" }}>
        <div style={{ maxWidth: 640, margin: "0 auto" }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: "#B8862B", marginBottom: 10 }}>
            {business.name.toUpperCase()}
          </div>
          <h1 style={{ fontSize: 26, margin: "0 0 8px" }}>Meet Our Instructors</h1>
          <p style={{ fontSize: 14, color: "#D7DED9", margin: 0 }}>
            Get to know who you'll be working with before you book.
          </p>
        </div>
      </header>

      <main style={{ maxWidth: 640, margin: "0 auto", padding: "24px 20px 60px" }}>
        {withBios.length === 0 ? (
          <p style={{ fontSize: 13, color: "#8A8571" }}>Nothing to show here yet.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {withBios.map((m) => (
              <div key={m.id} style={{ background: "#FFF", border: "1px solid #E3D9C9", borderRadius: 14, padding: 20 }}>
                <div style={{ display: "flex", gap: 16, alignItems: "flex-start", marginBottom: m.bio ? 12 : 0 }}>
                  <div style={{
                    width: 76, height: 76, borderRadius: "50%", overflow: "hidden", flexShrink: 0,
                    background: "#F0EBDD", display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {m.bioPhotoUrl ? (
                      <Image src={m.bioPhotoUrl} alt="" width={76} height={76} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <span style={{ fontSize: 28, color: "#B8A97A" }}>👤</span>
                    )}
                  </div>
                  <div style={{ paddingTop: 4 }}>
                    <div style={{ fontSize: 17, fontWeight: 700, color: "#1B3A2F" }}>
                      {m.user.name || m.user.email}
                    </div>
                    {m.specialty && (
                      <div style={{ fontSize: 12.5, color: "#8A8571", marginTop: 2 }}>{m.specialty}</div>
                    )}
                    {ratingsByMembership.has(m.id) && (
                      <div style={{ fontSize: 12.5, color: "#B8862B", marginTop: 4, fontWeight: 700 }}>
                        &#9733; {ratingsByMembership.get(m.id)!.avg.toFixed(1)}{" "}
                        <span style={{ color: "#8A8571", fontWeight: 400 }}>
                          ({ratingsByMembership.get(m.id)!.count} review{ratingsByMembership.get(m.id)!.count === 1 ? "" : "s"})
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                {m.bio && (
                  <p style={{ fontSize: 13.5, lineHeight: 1.7, color: "#3A4038", margin: 0, whiteSpace: "pre-wrap" }}>
                    {m.bio}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        <a
          href={`/${params.slug}/book`}
          style={{
            display: "block", textAlign: "center", marginTop: 24, background: "#1B3A2F", color: "#F6F4EE",
            borderRadius: 8, padding: "11px 0", fontWeight: 700, fontSize: 14, textDecoration: "none",
          }}
        >
          Book a lesson
        </a>
      </main>
    </div>
  );
}
