import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// PATCH /api/user  { name?, phone?, emailReminders?, textReminders?, reminderHours?, handedness?, scoreOrHandicap?, commonIssues? }
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const body = await req.json();
  const allowed = ["name", "phone", "emailReminders", "textReminders", "reminderHours", "handedness", "scoreOrHandicap", "commonIssues"];
  const data: Record<string, unknown> = {};
  for (const key of allowed) if (key in body) data[key] = body[key];

  const updated = await prisma.user.update({ where: { id: (session.user as any).id }, data });
  return NextResponse.json(updated);
}
