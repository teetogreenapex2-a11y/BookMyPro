import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { seedInstructorAvailability } from "@/lib/seedAvailability";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Sign in first, then visit this URL again." }, { status: 401 });
  }

  const userId = (session.user as any).id;
  const memberships = await prisma.membership.findMany({
    where: { userId, role: { in: ["owner", "instructor"] } },
    include: { business: { select: { name: true } }, user: { select: { name: true, email: true } } },
  });

  const results: string[] = [];
  for (const m of memberships) {
    const count = await seedInstructorAvailability(m.businessId, m.id);
    results.push(`${m.business.name} - ${m.user.name || m.user.email}: ${count} slots ensured (existing ones left untouched).`);
  }

  return NextResponse.json({
    message: results.length === 0 ? "No instructor memberships found for your account." : "Repair complete.",
    results,
  });
}
