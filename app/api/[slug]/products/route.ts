import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug, getMembership, requireMembership } from "@/lib/tenant";
import { uploadProductImage } from "@/lib/productStorage";

// GET /api/{slug}/products — players and the public see only enabled
// products; the owner (viewing their own Settings) sees everything,
// including disabled ones, so they can re-enable something without
// having to remember what they turned off.
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const session = await getServerSession(authOptions);
  let isOwner = false;
  if (session) {
    const membership = await getMembership((session.user as any).id, business.id);
    isOwner = membership?.role === "owner";
  }

  const products = await prisma.product.findMany({
    where: { businessId: business.id, ...(isOwner ? {} : { enabled: true }) },
    include: { variants: true },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(products);
}

// POST /api/{slug}/products — owner only. Multipart form: name, description?,
// category?, priceCents, image (file, optional), variantsJson (optional —
// array of { label, stockQuantity }), stockQuantity (optional, only used
// when there are no variants).
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const membership = await requireMembership((session.user as any).id, business.id, ["owner"]);
  if (!membership) return NextResponse.json({ error: "Owner access required" }, { status: 403 });

  const form = await req.formData();
  const name = form.get("name")?.toString().trim();
  const description = form.get("description")?.toString().trim() || null;
  const category = form.get("category")?.toString().trim() || null;
  const priceCents = Number(form.get("priceCents"));
  const stockQuantity = form.get("stockQuantity") ? Number(form.get("stockQuantity")) : null;
  const variantsJson = form.get("variantsJson")?.toString();
  const imageFile = form.get("image");

  if (!name) return NextResponse.json({ error: "Give the product a name" }, { status: 400 });
  if (!Number.isFinite(priceCents) || priceCents < 0) {
    return NextResponse.json({ error: "Enter a valid price" }, { status: 400 });
  }

  let imageUrl: string | null = null;
  if (imageFile instanceof File) {
    const uploaded = await uploadProductImage(imageFile, business.id);
    if ("error" in uploaded) return NextResponse.json({ error: uploaded.error }, { status: 400 });
    imageUrl = uploaded.url;
  }

  let variants: { label: string; stockQuantity: number }[] = [];
  if (variantsJson) {
    try {
      const parsed = JSON.parse(variantsJson);
      if (Array.isArray(parsed)) {
        variants = parsed
          .filter((v) => v && typeof v.label === "string" && v.label.trim())
          .map((v) => ({ label: v.label.trim(), stockQuantity: Number(v.stockQuantity) || 0 }));
      }
    } catch {
      // Ignore malformed variant JSON rather than failing the whole product creation over it.
    }
  }

  const product = await prisma.product.create({
    data: {
      businessId: business.id,
      name,
      description,
      category,
      priceCents: Math.round(priceCents),
      imageUrl,
      stockQuantity: variants.length === 0 ? stockQuantity : null,
      variants: variants.length > 0 ? { create: variants } : undefined,
    },
    include: { variants: true },
  });

  return NextResponse.json(product, { status: 201 });
}
