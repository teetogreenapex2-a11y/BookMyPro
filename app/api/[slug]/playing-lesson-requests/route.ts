import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug, getMembership, getBookingNotificationRecipients } from "@/lib/tenant";
import { sendPlayingLessonRequestNotification } from "@/lib/email";

// POST /api/{slug}/playing-lesson-requests
//   { instructorMembershipId, holes: 9 | 18, preferredDate?, notes?, contactName?, contactPhone?, contactEmail? }
//
// A request, not a booking - see PlayingLessonRequest in schema.prisma
// for why this doesn't touch the regular hourly-slot calendar at all.
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const { instructorMembershipId, holes, preferredDate, notes, contactName, contactPhone, contactEmail } = await req.json();

  if (holes !== 9 && holes !== 18) {
    return NextResponse.json({ error: "Choose 9 or 18 holes" }, { status: 400 });
  }
  if (!instructorMembershipId) {
    return NextResponse.json({ error: "Choose which instructor you're requesting" }, { status: 400 });
  }

  const instructor = await prisma.membership.findFirst({
    where: { id: instructorMembershipId, businessId: business.id, role: { in: ["owner", "instructor"] } },
    include: { user: { select: { name: true } } },
  });
  if (!instructor) return NextResponse.json({ error: "That instructor isn't available at this business" }, { status: 400 });

  const enabled = holes === 9 ? instructor.playingLesson9Enabled : instructor.playingLesson18Enabled;
  const priceCents = holes === 9 ? instructor.playingLesson9PriceCents : instructor.playingLesson18PriceCents;
  if (!enabled) {
    return NextResponse.json({ error: `This instructor doesn't currently offer a ${holes}-hole playing lesson` }, { status: 400 });
  }

  const userId = (session.user as any).id;
  const player = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true, phone: true } });

  const created = await prisma.playingLessonRequest.create({
    data: {
      businessId: business.id,
      instructorMembershipId,
      playerId: userId,
      holes,
      priceCents,
      preferredDate: preferredDate ? new Date(preferredDate) : null,
      notes: typeof notes === "string" ? notes.trim().slice(0, 500) || null : null,
      contactName: contactName?.trim() || player?.name || null,
      contactPhone: contactPhone?.trim() || player?.phone || null,
      contactEmail: contactEmail?.trim() || player?.email || null,
    },
  });

  const recipients = await getBookingNotificationRecipients(business, instructorMembershipId);
  await sendPlayingLessonRequestNotification(recipients, {
    businessName: business.name,
    playerName: created.contactName || player?.name || "A player",
    holes,
    priceCents,
    preferredDate: created.preferredDate,
    notes: created.notes,
    contactPhone: created.contactPhone,
    contactEmail: created.contactEmail,
  }).catch(() => {});

  return NextResponse.json(created, { status: 201 });
}

// GET /api/{slug}/playing-lesson-requests
// Owner sees every request at the business; an instructor sees only
// their own - same split already used for pricing elsewhere.
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const requesterMembership = await getMembership((session.user as any).id, business.id);
  if (!requesterMembership || (requesterMembership.role !== "owner" && requesterMembership.role !== "instructor")) {
    return NextResponse.json({ error: "Instructor access required" }, { status: 403 });
  }

  const requests = await prisma.playingLessonRequest.findMany({
    where: {
      businessId: business.id,
      ...(requesterMembership.role === "owner" ? {} : { instructorMembershipId: requesterMembership.id }),
    },
    include: { player: { select: { name: true, email: true } }, instructor: { include: { user: { select: { name: true } } } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(requests);
}
