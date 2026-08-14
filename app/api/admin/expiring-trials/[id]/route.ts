import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isPlatformAdmin } from "@/lib/tenant";
import { deleteBusinessCompletely } from "@/lib/deleteBusiness";

// POST /api/admin/expiring-trials/{id}  { action: "extend" | "delete" }
// "extend" gives them another week before this comes up for review
// again - a real decision to give more time, not a snooze that hides
// the problem. "delete" is genuinely, permanently irreversible - every
// booking, customer, message, and dollar of history tied to this
// business is gone the moment this runs, which is exactly why this only
// ever happens from a specific, deliberate choice here, never on its
// own in the background.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const isAdmin = await isPlatformAdmin((session.user as any).id);
  if (!isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const business = await prisma.business.findUnique({ where: { id: params.id } });
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const { action } = await req.json();
  if (action === "extend") {
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 7);
    await prisma.business.update({ where: { id: params.id }, data: { trialEndsAt } });
  } else if (action === "delete") {
    await deleteBusinessCompletely(params.id);
  } else {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
