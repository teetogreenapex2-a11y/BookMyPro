import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug } from "@/lib/tenant";

// GET /api/{slug}/packages — the current user's packages at this business
export async function GET(req: Request, { params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const packages = await prisma.package.findMany({
    where: { userId: (session.user as any).id, businessId: business.id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(packages);
}
