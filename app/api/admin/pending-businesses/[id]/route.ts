import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isPlatformAdmin } from "@/lib/tenant";

// PATCH /api/admin/pending-businesses/{id}  { action: "approve" | "deny" }
// Approving flips the business live for real bookings. Denying removes
// the business entirely, along with its owner's membership and any
// availability already seeded for it - the account itself is untouched,
// same as denying an instructor request doesn't touch the person's
// account, just the specific thing they were requesting.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const isAdmin = await isPlatformAdmin((session.user as any).id);
  if (!isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const business = await prisma.business.findUnique({ where: { id: params.id } });
  if (!business || business.approved) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const { action } = await req.json();
  if (action === "approve") {
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 30);
    await prisma.business.update({ where: { id: params.id }, data: { approved: true, trialEndsAt } });
  } else if (action === "deny") {
    await prisma.availability.deleteMany({ where: { businessId: params.id } });
    await prisma.membership.deleteMany({ where: { businessId: params.id } });
    await prisma.business.delete({ where: { id: params.id } });
  } else {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
