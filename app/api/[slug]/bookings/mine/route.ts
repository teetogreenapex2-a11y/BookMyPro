import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug } from "@/lib/tenant";

// GET /api/{slug}/bookings/mine — the signed-in player's own upcoming
// bookings at this business. Exists mainly so a remote lesson's video call
// link (and a pending request's eventual approval) has somewhere durable
// to show up, rather than only ever appearing in a one-time confirmation
// message right after booking.
export async function GET(req: Request, { params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const userId = (session.user as any).id;
  const bookings = await prisma.booking.findMany({
    where: {
      businessId: business.id,
      playerId: userId,
      status: { in: ["confirmed", "pending"] },
      startTime: { gte: new Date() },
    },
    include: { instructor: { include: { user: { select: { name: true } } } } },
    orderBy: { startTime: "asc" },
  });

  const shaped = bookings.map((b) => ({
    id: b.id,
    serviceType: b.serviceType,
    fittingType: b.fittingType,
    startTime: b.startTime,
    status: b.status,
    isRemote: b.isRemote,
    videoCallUrl: b.videoCallUrl,
    instructorName: b.instructor?.user.name || null,
  }));

  return NextResponse.json(shaped);
}
