import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug } from "@/lib/tenant";

// Public, read-only product list for a business's own website (for example
// teetogreenapex.com), so featured products there always match the shop.
// Only enabled products, and only what a visitor needs to see - never exact
// stock counts.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET(_req: NextRequest, { params }: { params: { slug: string } }) {
  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404, headers: CORS });

  const products = await prisma.product.findMany({
    where: { businessId: business.id, enabled: true },
    include: { variants: true },
    orderBy: { createdAt: "desc" },
    take: 24,
  });

  const list = products.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    category: p.category,
    imageUrl: p.imageUrl,
    priceCents: p.priceCents,
    inStock: p.variants.length > 0
      ? p.variants.some((v) => v.stockQuantity > 0)
      : p.stockQuantity === null || p.stockQuantity > 0,
  }));

  return NextResponse.json(list, {
    headers: { ...CORS, "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
  });
}
