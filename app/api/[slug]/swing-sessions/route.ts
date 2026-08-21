import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug, getMembership, getInstructorById } from "@/lib/tenant";

function generateJoinCode() {
  // Six digits, easy to read aloud or type quickly on a second phone
  // that's about to be set up on a tripod down the target line.
  return String(Math.floor(100000 + Math.random() * 900000));
}

// POST /api/{slug}/swing-sessions  { instructorMembershipId, playerId? }
//
// Creates a new two-camera session and returns a short join code for a
// second device. Either a player (recording their own swing) or staff
// (recording during a lesson) can start one - staff has to say which
// player it's for, same as the existing single-video upload flow.
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const userId = (session.user as any).id;
  const membership = await getMembership(userId, business.id);
  if (!membership) return NextResponse.json({ error: "Not a member of this business" }, { status: 403 });
  const isStaff = membership.role === "owner" || membership.role === "instructor";

  const { instructorMembershipId, playerId: suppliedPlayerId } = await req.json();
  if (!instructorMembershipId) return NextResponse.json({ error: "Choose which instructor this is for" }, { status: 400 });
  const instructorMembership = await getInstructorById(business.id, instructorMembershipId);
  if (!instructorMembership) return NextResponse.json({ error: "That instructor isn't available at this business" }, { status: 400 });

  let playerId: string;
  if (isStaff) {
    if (!suppliedPlayerId) return NextResponse.json({ error: "Choose which player this is for" }, { status: 400 });
    const playerMembership = await getMembership(suppliedPlayerId, business.id);
    if (!playerMembership || playerMembership.role !== "player") return NextResponse.json({ error: "That player isn't part of this business" }, { status: 400 });
    playerId = suppliedPlayerId;
  } else {
    playerId = userId;
  }

  // Collisions are genuinely unlikely at this scale, but a real retry
  // loop costs nothing and makes this correct rather than just probably fine.
  let joinCode = generateJoinCode();
  for (let i = 0; i < 5; i++) {
    const existing = await prisma.swingSession.findUnique({ where: { joinCode } });
    if (!existing) break;
    joinCode = generateJoinCode();
  }

  const swingSession = await prisma.swingSession.create({
    data: { businessId: business.id, createdByUserId: userId, joinCode, instructorMembershipId, playerId },
  });

  return NextResponse.json(swingSession, { status: 201 });
}
