import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Image from "next/image";
import { getBusinessBySlug, getBusinessInstructors } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function load(slug: string, id: string) {
  const business = await getBusinessBySlug(slug);
  if (!business) return null;
  const staff = await getBusinessInstructors(business.id);
  const m = staff.find((x) => x.id === id && !x.hiddenFromBooking);
  return m ? { business, m } : null;
}

export async function generateMetadata({ params }: { params: { slug: string; id: string } }): Promise<Metadata> {
  const d = await load(params.slug, params.id);
  if (!d) return {};
  const name = d.m.user.name || "Instructor";
  return {
    title: `${name} | ${d.business.name}`,
    description: d.m.specialty || `Meet ${name}, golf instructor at ${d.business.name}.`,
  };
}

function shortName(n: string | null) {
  const parts = (n || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "A student";
  return parts.length === 1 ? parts[0] : `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

export default async function InstructorProfilePage({ params }: { params: { slug: string; id: string } }) {
  const d = await load(params.slug, params.id);
  if (!d) notFound();
  const { business, m } = d;
  const name = m.user.name || m.user.email;

  const [agg, reviews] = await Promise.all([
    prisma.review.aggregate({ where: { businessId: business.id, instructorMembershipId: m.id }, _avg: { rating: true }, _count: { rating: true } }),
    prisma.review.findMany({
      where: { businessId: business.id, instructorMembershipId: m.id, text: { not: null } },
      orderBy: { createdAt: "desc" }, take: 12,
      select: { id: true, rating: true, text: true, createdAt: true, player: { select: { name: true } } },
    }),
  ]);
  const count = agg._count.rating;
  const avg = agg._avg.rating || 0;
  const withText = reviews.filter((r) => r.text && r.text.trim());

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: m.user.name || undefined,
    jobTitle: "Golf instructor",
    description: m.specialty || undefined,
    image: m.bioPhotoUrl || undefined,
    worksFor: { "@type": "LocalBusiness", name: business.name },
  };

  return (
    <div style={{ minHeight: "100vh", background: "#F6F4EE", fontFamily: "sans-serif" }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <header style={{ background: "#1B3A2F", color: "#F6F4EE", padding: "20px 20px 28px" }}>
        <div style={{ maxWidth: 640, margin: "0 auto" }}>
          <a href={`/${params.slug}/instructors`} style={{ fontSize: 13, color: "#D7DED9", textDecoration: "none" }}>&larr; All instructors</a>
          <div style={{ display: "flex", gap: 18, alignItems: "center", marginTop: 16 }}>
            <div style={{ width: 104, height: 104, borderRadius: "50%", overflow: "hidden", flexShrink: 0, background: "#F0EBDD", display: "flex", alignItems: "center", justifyContent: "center", border: "3px solid #B8862B" }}>
              {m.bioPhotoUrl ? (
                <Image src={m.bioPhotoUrl} alt={name || ""} width={104} height={104} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <span style={{ fontSize: 40, color: "#B8A97A" }}>👤</span>
              )}
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: "#B8862B", marginBottom: 6 }}>{business.name.toUpperCase()}</div>
              <h1 style={{ fontSize: 26, margin: 0 }}>{name}</h1>
              {m.specialty && <div style={{ fontSize: 14, color: "#D7DED9", marginTop: 4 }}>{m.specialty}</div>}
              {count > 0 && (
                <div style={{ fontSize: 14, color: "#E8C877", marginTop: 6, fontWeight: 700 }}>
                  &#9733; {avg.toFixed(1)} <span style={{ color: "#D7DED9", fontWeight: 400 }}>({count} review{count === 1 ? "" : "s"})</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 640, margin: "0 auto", padding: "24px 20px 60px" }}>
        <a
          href={`/${params.slug}/book?instructor=${m.id}`}
          style={{ display: "block", textAlign: "center", background: "#B8862B", color: "#FFF", borderRadius: 10, padding: "13px 0", fontWeight: 700, fontSize: 15, textDecoration: "none", marginBottom: 24 }}
        >
          Book with {(m.user.name || "this instructor").split(" ")[0]}
        </a>

        {m.bio ? (
          <section style={{ background: "#FFF", border: "1px solid #E3D9C9", borderRadius: 14, padding: 20, marginBottom: 20 }}>
            <h2 style={{ fontSize: 16, margin: "0 0 10px", color: "#1B3A2F" }}>About {(m.user.name || "").split(" ")[0] || "me"}</h2>
            <p style={{ fontSize: 14.5, lineHeight: 1.75, color: "#3A4038", margin: 0, whiteSpace: "pre-wrap" }}>{m.bio}</p>
          </section>
        ) : null}

        {withText.length > 0 && (
          <section style={{ marginBottom: 20 }}>
            <h2 style={{ fontSize: 16, margin: "0 0 10px", color: "#1B3A2F" }}>What students say</h2>
            {withText.map((r) => (
              <div key={r.id} style={{ background: "#FFF", border: "1px solid #E3D9C9", borderRadius: 12, padding: "12px 14px", marginBottom: 8 }}>
                <div style={{ color: "#B8862B", fontSize: 13, fontWeight: 700 }}>{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</div>
                <p style={{ fontSize: 13.5, lineHeight: 1.6, color: "#3A4038", margin: "4px 0" }}>{r.text}</p>
                <div style={{ fontSize: 12, color: "#8A8571" }}>{shortName(r.player.name)} &middot; {r.createdAt.toLocaleDateString("en-US", { month: "short", year: "numeric" })}</div>
              </div>
            ))}
          </section>
        )}

        <a
          href={`/${params.slug}/book?instructor=${m.id}`}
          style={{ display: "block", textAlign: "center", background: "#1B3A2F", color: "#F6F4EE", borderRadius: 10, padding: "12px 0", fontWeight: 700, fontSize: 14, textDecoration: "none" }}
        >
          Book a lesson
        </a>
      </main>
    </div>
  );
}
