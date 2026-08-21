import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug } from "@/lib/tenant";

// GET /api/{slug}/swing-sessions/{id}
//
// Polled by the device that created the session, so it can show "still
// waiting on the other phone" and then automatically move on once both
// angles are actually in.
export async function GET(req: NextRequest, { params }: { params: { slug: string; id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const swingSession = await prisma.swingSession.findUnique({
    where: { id: params.id },
    include: { videos: { select: { id: true, angle: true, videoUrl: true } } },
  });
  if (!swingSession || swingSession.businessId !== business.id) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  return NextResponse.json(swingSession);
}
