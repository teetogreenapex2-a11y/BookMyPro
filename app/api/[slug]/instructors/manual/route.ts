import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug, requireMembership } from "@/lib/tenant";
import { seedInstructorAvailability } from "@/lib/seedAvailability";

// POST /api/{slug}/instructors/manual  { name, email }
// Owner only — adds another staff member. Same pattern as adding a customer
// manually: if this email already has a User record, it just adds a
// Membership at this business rather than erroring, and when they sign in
// with Google, allowDangerousEmailAccountLinking (see lib/auth.ts) connects
// them to this same record.
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  // Only the owner can add other staff — an instructor shouldn't be able to add more instructors.
  const membership = await requireMembership((session.user as any).id, business.id, ["owner"]);
  if (!membership) return NextResponse.json({ error: "Owner access required" }, { status: 403 });

  const { name, email, specialty } = await req.json();
  if (!name?.trim() || !email?.trim()) {
    return NextResponse.json({ error: "Name and email are required" }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
  }

  let user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!user) {
    user = await prisma.user.create({ data: { name: name.trim(), email: email.trim().toLowerCase() } });
  }

  const existing = await prisma.membership.findUnique({
    where: { userId_businessId: { userId: user.id, businessId: business.id } },
  });
  if (existing) {
    return NextResponse.json({ error: "This person is already part of this business" }, { status: 400 });
  }

  const newMembership = await prisma.membership.create({
    data: {
      userId: user.id,
      businessId: business.id,
      role: "instructor",
      specialty: typeof specialty === "string" ? specialty.trim().slice(0, 120) : null,
    },
  });

  await seedInstructorAvailability(business.id, newMembership.id, business.bookingWindowDays);

  return NextResponse.json({ id: newMembership.id, name: user.name, email: user.email, specialty: newMembership.specialty }, { status: 201 });
}
