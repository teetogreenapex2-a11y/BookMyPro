import { getServerSession } from "next-auth";
import { redirect, notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug, requireMembership, getBasePaths } from "@/lib/tenant";
import MergeClient from "./MergeClient";

export default async function MergeCustomersPage({ params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  const business = await getBusinessBySlug(params.slug);
  if (!business) notFound();
  const { basePath, apiBase } = getBasePaths(params.slug);
  const owner = await requireMembership((session.user as any).id, business.id, ["owner"]);
  if (!owner) redirect(`${basePath}/customers`);

  const memberships = await prisma.membership.findMany({
    where: { businessId: business.id, role: "player", isSandboxProspect: false },
    include: { user: { select: { id: true, name: true, email: true, phone: true } } },
  });

  // Group by name (case-insensitive) - the same person twice shows up as the same name.
  const groups = new Map<string, typeof memberships>();
  for (const m of memberships) {
    const key = (m.user.name || "").trim().toLowerCase();
    if (!key) continue;
    groups.set(key, [...(groups.get(key) || []), m]);
  }
  const dupes = Array.from(groups.values()).filter((g) => g.length > 1);

  const userIds = dupes.flatMap((g) => g.map((m) => m.user.id));
  const [pk, bk, vd, ac, se] = await Promise.all([
    prisma.package.groupBy({ by: ["userId"], where: { businessId: business.id, userId: { in: userIds } }, _count: true }),
    prisma.booking.groupBy({ by: ["playerId"], where: { businessId: business.id, playerId: { in: userIds } }, _count: true }),
    prisma.videoSubmission.groupBy({ by: ["playerId"], where: { businessId: business.id, playerId: { in: userIds } }, _count: true }),
    prisma.account.groupBy({ by: ["userId"], where: { userId: { in: userIds } }, _count: true }),
    prisma.session.groupBy({ by: ["userId"], where: { userId: { in: userIds } }, _count: true }),
  ]);
  const cnt = (rows: { _count: number; [k: string]: any }[], key: string, id: string) => rows.find((r) => r[key] === id)?._count || 0;

  const data = dupes.map((g) => ({
    name: g[0].user.name || "",
    members: g.map((m) => ({
      userId: m.user.id,
      email: m.user.email,
      phone: m.user.phone,
      packages: cnt(pk as any, "userId", m.user.id),
      bookings: cnt(bk as any, "playerId", m.user.id),
      videos: cnt(vd as any, "playerId", m.user.id),
      hasSignedIn: cnt(ac as any, "userId", m.user.id) + cnt(se as any, "userId", m.user.id) > 0,
    })),
  }));

  return <MergeClient groups={data} apiBase={apiBase} basePath={basePath} />;
}
