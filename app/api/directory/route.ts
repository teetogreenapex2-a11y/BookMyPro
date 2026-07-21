import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/directory?q=chapel+hill
// Public, no auth required — this is the whole point of a discovery
// directory. Only returns businesses that have explicitly opted in via
// listedInDirectory; matches loosely against city, state, or zip so
// "Chapel Hill", "NC", and "27517" all work as a search term.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();

  const businesses = await prisma.business.findMany({
    where: {
      listedInDirectory: true,
      ...(q
        ? {
            OR: [
              { city: { contains: q, mode: "insensitive" } },
              { state: { contains: q, mode: "insensitive" } },
              { zipCode: { contains: q, mode: "insensitive" } },
              { name: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    select: {
      slug: true,
      name: true,
      city: true,
      state: true,
      memberships: {
        where: { role: { in: ["owner", "instructor"] } },
        select: { specialty: true, user: { select: { name: true } } },
      },
    },
    orderBy: { name: "asc" },
    take: 50,
  });

  return NextResponse.json(businesses);
}
