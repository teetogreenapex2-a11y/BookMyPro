import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug } from "@/lib/tenant";

// POST /api/{slug}/swing-sessions/join  { joinCode }
//
// The second device uses this to find the session the first device
// already created, so it knows which instructor/player context to
// upload its own angle under - it doesn't need to be the same person
// signed in on both phones, just the same business.
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const { joinCode } = await req.json();
  if (!joinCode?.trim()) return NextResponse.json({ error: "Enter the code shown on the other phone" }, { status: 400 });

  const swingSession = await prisma.swingSession.findUnique({
    where: { joinCode: joinCode.trim() },
    include: { videos: true },
  });
  if (!swingSession || swingSession.businessId !== business.id) {
    return NextResponse.json({ error: "That code doesn't match an active session" }, { status: 404 });
  }
  // A real, if generous, expiry - a session left open for hours almost
  // certainly isn't still in use, and its code shouldn't stay valid
  // indefinitely.
  const ageMs = Date.now() - swingSession.createdAt.getTime();
  if (ageMs > 2 * 60 * 60 * 1000) {
    return NextResponse.json({ error: "That session has expired - start a new one" }, { status: 410 });
  }

  return NextResponse.json(swingSession);
}
