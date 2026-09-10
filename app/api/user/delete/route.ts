import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const userId = (session.user as any).id;

  const ownerMembership = await prisma.membership.findFirst({
    where: { userId, role: "owner" },
  });
  if (ownerMembership) {
    return NextResponse.json(
      { error: "You own a business on BookMyPro - email support@bookmypro.app to close your account so we can help transition or close out the business properly first." },
      { status: 400 }
    );
  }

  await prisma.$transaction([
    prisma.membership.deleteMany({ where: { userId } }),
    prisma.user.update({
      where: { id: userId },
      data: {
        name: "Deleted user",
        email: `deleted-${userId}@bookmypro.app`,
        phone: null,
        image: null,
        handedness: null,
        scoreOrHandicap: null,
        commonIssues: null,
      },
    }),
  ]);

  return NextResponse.json({ success: true });
}