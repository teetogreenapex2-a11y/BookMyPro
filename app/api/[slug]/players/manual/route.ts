import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug, requireMembership } from "@/lib/tenant";

// POST /api/{slug}/players/manual  { name, email, phone? }
// Owner/instructor only — for importing an existing client list, or adding
// someone who hasn't signed in yet so they're immediately selectable in the
// "New booking" form. If this email already has a User record (at any
// business — email is globally unique), this just adds a Membership at
// *this* business rather than erroring, so the same person can be a known
// customer at more than one business without conflict. When they eventually
// sign in with Google, allowDangerousEmailAccountLinking (see lib/auth.ts)
// connects them to this same record — same person, same history.
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const membership = await requireMembership((session.user as any).id, business.id, ["owner", "instructor"]);
  if (!membership) return NextResponse.json({ error: "Instructor access required" }, { status: 403 });

  const { name, email, phone } = await req.json();
  if (!name?.trim() || !email?.trim()) {
    return NextResponse.json({ error: "Name and email are required" }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
  }

  let user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!user) {
    user = await prisma.user.create({
      data: { name: name.trim(), email: email.trim().toLowerCase(), phone: phone?.trim() || null },
    });
  }

  const existingMembership = await prisma.membership.findUnique({
    where: { userId_businessId: { userId: user.id, businessId: business.id } },
  });
  if (existingMembership) {
    return NextResponse.json({ error: "This person is already a customer here" }, { status: 400 });
  }

  await prisma.membership.create({
    data: { userId: user.id, businessId: business.id, role: "player" },
  });

  return NextResponse.json({ id: user.id, name: user.name, email: user.email, phone: user.phone }, { status: 201 });
}
