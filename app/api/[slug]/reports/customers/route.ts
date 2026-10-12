import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug, getMembership } from "@/lib/tenant";

// GET /api/{slug}/reports/customers
//
// One row per customer package (plus one row per customer/instructor pair
// for lessons taken without a package): who, which instructor, how many
// lessons are left, last and next lesson dates. The owner sees every
// instructor; a plain instructor only sees their own customers.
//
// "remaining" is the REAL balance (what can actually be booked today).
// "upcoming" is lessons already booked on that package but not yet played,
// kept separate so the two are never mistaken for each other.
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const membership = await getMembership((session.user as any).id, business.id);
  if (!membership || (membership.role !== "owner" && membership.role !== "instructor")) {
    return NextResponse.json({ error: "Instructor access required" }, { status: 403 });
  }
  const isOwner = membership.role === "owner";
  const scope = isOwner ? {} : { instructorMembershipId: membership.id };

  const [packages, bookings] = await Promise.all([
    prisma.package.findMany({
      where: { businessId: business.id, ...scope },
      include: {
        user: { select: { id: true, name: true, email: true, phone: true } },
        instructor: { include: { user: { select: { name: true } } } },
      },
    }),
    prisma.booking.findMany({
      where: { businessId: business.id, serviceType: "lesson", status: "confirmed", ...scope },
      select: {
        playerId: true, packageId: true, startTime: true, instructorMembershipId: true,
        player: { select: { id: true, name: true, email: true, phone: true } },
        instructor: { select: { user: { select: { name: true } } } },
      },
    }),
  ]);

  const now = new Date();
  type Agg = { taken: number; upcoming: number; last: Date | null; next: Date | null };
  const empty = (): Agg => ({ taken: 0, upcoming: 0, last: null, next: null });
  const add = (a: Agg, t: Date) => {
    if (t <= now) {
      a.taken++;
      if (!a.last || t > a.last) a.last = t;
    } else {
      a.upcoming++;
      if (!a.next || t < a.next) a.next = t;
    }
  };

  const byPackage = new Map<string, Agg>();
  const noPackage = new Map<string, { agg: Agg; player: any; instructorName: string | null }>();
  for (const b of bookings) {
    if (b.packageId) {
      const a = byPackage.get(b.packageId) || empty();
      add(a, b.startTime);
      byPackage.set(b.packageId, a);
    } else {
      const key = `${b.playerId}:${b.instructorMembershipId || ""}`;
      const entry = noPackage.get(key) || { agg: empty(), player: b.player, instructorName: b.instructor?.user?.name || null };
      add(entry.agg, b.startTime);
      noPackage.set(key, entry);
    }
  }

  const rows: any[] = [];
  for (const p of packages) {
    const a = byPackage.get(p.id) || empty();
    rows.push({
      key: p.id,
      customerId: p.user.id,
      name: p.user.name || p.user.email,
      email: p.user.email,
      phone: p.user.phone,
      instructor: p.instructor?.user?.name || null,
      packageLabel: (p as any).durationLabel || p.type,
      lessonsTotal: p.lessonsTotal,
      remaining: p.lessonsRemaining,
      upcoming: a.upcoming,
      taken: a.taken,
      lastLesson: a.last,
      nextLesson: a.next,
      paymentStatus: p.paymentStatus,
      balanceDueCents: p.balanceDueCents || 0,
    });
  }
  noPackage.forEach((e, key) => {
    rows.push({
      key: `np:${key}`,
      customerId: e.player.id,
      name: e.player.name || e.player.email,
      email: e.player.email,
      phone: e.player.phone,
      instructor: e.instructorName,
      packageLabel: "No package",
      lessonsTotal: null,
      remaining: null,
      upcoming: e.agg.upcoming,
      taken: e.agg.taken,
      lastLesson: e.agg.last,
      nextLesson: e.agg.next,
      paymentStatus: null,
      balanceDueCents: 0,
    });
  });

  return NextResponse.json({ isOwner, rows });
}
