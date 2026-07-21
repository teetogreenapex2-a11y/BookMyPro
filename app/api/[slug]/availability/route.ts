import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug, requireMembership } from "@/lib/tenant";

// GET /api/{slug}/availability?start=ISO&end=ISO&instructorMembershipId=X
// Each instructor has their own independent timeline now — two instructors
// can both be open (or both booked) at the same startTime, since they're
// two different people. instructorMembershipId is required for this
// reason: there's no single "the business's" calendar anymore.
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const start = req.nextUrl.searchParams.get("start");
  const end = req.nextUrl.searchParams.get("end");
  const instructorMembershipId = req.nextUrl.searchParams.get("instructorMembershipId");
  if (!instructorMembershipId) {
    return NextResponse.json({ error: "instructorMembershipId is required" }, { status: 400 });
  }

  const slots = await prisma.availability.findMany({
    where: {
      businessId: business.id, // <- the tenant boundary; nothing outside this business can leak in
      instructorMembershipId,
      ...(start && end ? { startTime: { gte: new Date(start), lte: new Date(end) } } : {}),
    },
    include: { booking: { select: { serviceType: true, isRemote: true } } },
    orderBy: { startTime: "asc" },
  });

  const shaped = slots.map((s) => ({
    id: s.id,
    startTime: s.startTime,
    status: s.status,
    bookedServiceType: s.booking?.serviceType || null,
    bookedIsRemote: s.booking?.isRemote || false,
  }));

  return NextResponse.json(shaped);
}

// PATCH /api/{slug}/availability  { id, status }
// Owner/instructor only. An instructor can only toggle their own slots; the
// owner can toggle anyone's on the team.
export async function PATCH(req: NextRequest, { params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const membership = await requireMembership((session.user as any).id, business.id, ["owner", "instructor"]);
  if (!membership) return NextResponse.json({ error: "Instructor access required for this business" }, { status: 403 });

  const { id, status } = await req.json();
  if (!["open", "closed"].includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  // Scoping by businessId here (not just id) is what actually enforces the
  // tenant boundary — without it, a valid slot id from any business would work.
  const slot = await prisma.availability.findFirst({ where: { id, businessId: business.id } });
  if (!slot) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (slot.status === "booked" || slot.status === "pending") {
    return NextResponse.json({ error: "Cannot edit a booked or pending slot directly" }, { status: 400 });
  }
  if (membership.role !== "owner" && slot.instructorMembershipId !== membership.id) {
    return NextResponse.json({ error: "You can only edit your own availability" }, { status: 403 });
  }

  const updated = await prisma.availability.update({ where: { id }, data: { status } });
  return NextResponse.json(updated);
}
