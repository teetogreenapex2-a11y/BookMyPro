import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getBusinessBySlug, getBusinessInstructors } from "@/lib/tenant";

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

  return (
    <div style={{ minHeight: "100vh", background: "#F6F4EE", fontFamily: "sans-serif" }}>
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
                      <img src={m.bioPhotoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
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
