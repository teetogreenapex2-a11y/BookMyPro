import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { businessDestination } from "@/lib/businessUrl";

// With multi-tenancy, there's no single "the business" to redirect to
// anymore — a user's landing spot depends on which business(es) they're a
// member of. Note: players never actually hit the "0 memberships" branch in
// practice, since visiting any /{slug}/book page auto-creates a player
// Membership for them — so reaching "/" with zero memberships means this is
// someone new to the app entirely, which is exactly who onboarding is for.
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
    redirect("/onboarding");
  }

  // Belongs to more than one business — show a simple picker.
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
                {m.business.name} — <span style={{ fontWeight: 400, color: "#5C6459" }}>{m.role}</span>
              </a>
            </li>
          );
        })}
      </ul>
      <a href="/onboarding" style={{ fontSize: 13, color: "#5C6459" }}>+ Create another business</a>
    </div>
  );
}
