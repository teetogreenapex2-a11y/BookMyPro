import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getBusinessBySlug, requireMembership } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request, { params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const membership = await requireMembership((session.user as any).id, business.id, ["owner", "instructor"]);
  if (!membership) return NextResponse.json({ error: "Instructor access required" }, { status: 403 });

  // Clearing the refresh token is the actual disconnect - it's what
  // status/route.ts checks for "connected", and without it calendarSync.ts
  // can no longer call the Google Calendar API on this instructor's
  // behalf. Existing googleCalendarEventId values on past bookings are
  // left alone - they're just a historical record and stop being useful
  // once the token's gone, not something that needs cleanup here.
  await prisma.membership.update({
    where: { id: membership.id },
    data: { googleRefreshToken: null },
  });

  return NextResponse.json({ disconnected: true });
}
