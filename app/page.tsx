import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { businessDestination } from "@/lib/businessUrl";

export default async function HomePage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const userId = (session.user as any).id;
  const memberships = await prisma.membership.findMany({
    where: { userId },
    include: { business: true },
  });

  if (memberships.length === 1) {
    const m = memberships[0];
    const destination = m.role === "owner" || m.role === "instructor" ? "instructor" : "book";
    redirect(businessDestination(m.business.slug, `/${destination}`));
  }

  if (memberships.length === 0) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "sans-serif", background: "#1B3A2F" }}>
        <div style={{ background: "#F6F4EE", borderRadius: 16, padding: "36px 32px", maxWidth: 380, width: "100%", textAlign: "center" }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: "#B8862B", marginBottom: 14 }}>BOOKMYPRO</div>
          <h1 style={{ fontSize: 22, marginBottom: 24, color: "#1B3A2F" }}>What brings you here?</h1>
<a
          
            href="/find-a-pro"
            style={{ display: "block", background: "#1B3A2F", color: "#F6F4EE", borderRadius: 8, padding: "13px 20px", fontWeight: 700, fontSize: 14, textDecoration: "none", marginBottom: 10 }}
          >
            I'm looking to book a lesson
          </a>
<a
          
            href="/onboarding"
            style={{ display: "block", background: "none", color: "#1B3A2F", border: "1px solid #E3D9C9", borderRadius: 8, padding: "13px 20px", fontWeight: 600, fontSize: 14, textDecoration: "none" }}
          >
            I'm a coach or instructor
          </a>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", padding: 24, fontFamily: "sans-serif" }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: "#B8862B", marginBottom: 8 }}>BOOKMYPRO</div>
      <h1 style={{ fontSize: 20, marginBottom: 16 }}>Choose a business</h1>
      <ul style={{ listStyle: "none", padding: 0, display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
        {memberships.map((m) => {
          const destination = m.role === "owner" || m.role === "instructor" ? "instructor" : "book";
          return (
            <li key={m.id}>
              <a href={businessDestination(m.business.slug, `/${destination}`)} style={{ color: "#1B3A2F", fontWeight: 600 }}>
                {m.business.name} - <span style={{ fontWeight: 400, color: "#5C6459" }}>{m.role}</span>
              </a>
            </li>
          );
        })}
      </ul>
      <a href="/onboarding" style={{ fontSize: 13, color: "#5C6459" }}>+ Create another business</a>
    </div>
  );
}
