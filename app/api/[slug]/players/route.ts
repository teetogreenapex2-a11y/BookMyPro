import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug, requireMembership } from "@/lib/tenant";
import { findPackage } from "@/lib/pricing";

// GET /api/{slug}/players — owner/instructor only. Used by the manual
// "New booking" form to search/select an existing player, and to show
// their packages so a lesson booking can optionally draw from one.
export async function GET(req: Request, { params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const membership = await requireMembership((session.user as any).id, business.id, ["owner", "instructor"]);
  if (!membership) return NextResponse.json({ error: "Instructor access required" }, { status: 403 });

  const playerMemberships = await prisma.membership.findMany({
    where: { businessId: business.id, role: "player" },
    include: {
      user: {
        include: {
          packages: { where: { businessId: business.id, lessonsRemaining: { gt: 0 } }, orderBy: { createdAt: "desc" } },
        },
      },
    },
  });

  const players = playerMemberships.map(({ user }) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    packages: user.packages.map((pkg) => ({
      id: pkg.id,
      label: findPackage(pkg.type)?.label || pkg.type,
      lessonsRemaining: pkg.lessonsRemaining,
      lessonsTotal: pkg.lessonsTotal,
    })),
  }));

  return NextResponse.json(players);
}
