import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PERSONAL_TRIAL_DAYS } from "@/lib/personal";

// POST /api/personal/trial - starts the free week right away, no card.
// Once per person; a card is only needed when the week is up.
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const userId = (session.user as any).id as string;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { personalTrialEndsAt: true } });
  if (user?.personalTrialEndsAt) return NextResponse.json({ error: "Your free week has already been used." }, { status: 400 });
  const ends = new Date(Date.now() + PERSONAL_TRIAL_DAYS * 24 * 60 * 60 * 1000);
  await prisma.user.update({ where: { id: userId }, data: { personalTrialEndsAt: ends } });
  return NextResponse.json({ ok: true, trialEndsAt: ends.toISOString() });
}
