import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/businesses/search?q=fairway
//
// Used by the onboarding questionnaire when someone says they're joining
// an academy or club that's already on BookMyPro - lets them find it by
// name or city and send the owner a join request (the existing
// /{slug}/join-as-instructor flow, which still needs the owner's approval).
//
// Signed-in only, and deliberately limited to businesses that are both
// approved and have opted in to the public directory (listedInDirectory) -
// an academy that keeps itself unlisted isn't discoverable this way, its
// owner just shares their direct join link instead. Returns only the bare
// minimum needed to recognize the right place: name, city, state, slug.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const q = req.nextUrl.searchParams.get("q")?.trim() || "";
  if (q.length < 2) return NextResponse.json([]);

  const terms = q.split(/[,\s]+/).filter(Boolean).slice(0, 5);

  const businesses = await prisma.business.findMany({
    where: {
      approved: true,
      listedInDirectory: true,
      AND: terms.map((term) => ({
        OR: [
          { name: { contains: term, mode: "insensitive" as const } },
          { city: { contains: term, mode: "insensitive" as const } },
          { state: { contains: term, mode: "insensitive" as const } },
        ],
      })),
    },
    select: { slug: true, name: true, city: true, state: true },
    orderBy: { name: "asc" },
    take: 8,
  });

  return NextResponse.json(businesses);
}
