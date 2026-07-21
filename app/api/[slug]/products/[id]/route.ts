import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug, requireMembership } from "@/lib/tenant";
import { uploadProductImage } from "@/lib/productStorage";

async function requireOwnerAndProduct(slug: string, id: string) {
  const session = await getServerSession(authOptions);
  if (!session) return { error: NextResponse.json({ error: "Sign in required" }, { status: 401 }) };

  const business = await getBusinessBySlug(slug);
  if (!business) return { error: NextResponse.json({ error: "Business not found" }, { status: 404 }) };

  const membership = await requireMembership((session.user as any).id, business.id, ["owner"]);
  if (!membership) return { error: NextResponse.json({ error: "Owner access required" }, { status: 403 }) };

  const product = await prisma.product.findFirst({ where: { id, businessId: business.id } });
  if (!product) return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };

  return { business, product };
}

// PATCH /api/{slug}/products/{id} — multipart form, same fields as create,
// all optional (only what's included gets updated). Owner only.
export async function PATCH(req: NextRequest, { params }: { params: { slug: string; id: string } }) {
  const result = await requireOwnerAndProduct(params.slug, params.id);
  if ("error" in result) return result.error;
  const { business, product } = result;

  const form = await req.formData();
  const data: any = {};

  if (form.has("name")) data.name = form.get("name")!.toString().trim();
  if (form.has("description")) data.description = form.get("description")!.toString().trim() || null;
  if (form.has("category")) data.category = form.get("category")!.toString().trim() || null;
  if (form.has("priceCents")) {
    const p = Number(form.get("priceCents"));
    if (Number.isFinite(p) && p >= 0) data.priceCents = Math.round(p);
  }
  if (form.has("enabled")) data.enabled = form.get("enabled") === "true";
  if (form.has("stockQuantity")) {
    const s = form.get("stockQuantity")?.toString();
    data.stockQuantity = s ? Number(s) : null;
  }

  const imageFile = form.get("image");
  if (imageFile instanceof File) {
    const uploaded = await uploadProductImage(imageFile, business.id);
    if ("error" in uploaded) return NextResponse.json({ error: uploaded.error }, { status: 400 });
    data.imageUrl = uploaded.url;
  }

  const updated = await prisma.product.update({ where: { id: product.id }, data, include: { variants: true } });
  return NextResponse.json(updated);
}

// DELETE /api/{slug}/products/{id} — owner only. Products that already
// have order history are disabled instead of deleted, so past orders keep
// a real product to point back to rather than a dangling reference.
export async function DELETE(req: NextRequest, { params }: { params: { slug: string; id: string } }) {
  const result = await requireOwnerAndProduct(params.slug, params.id);
  if ("error" in result) return result.error;
  const { product } = result;

  const orderCount = await prisma.orderItem.count({ where: { productId: product.id } });
  if (orderCount > 0) {
    await prisma.product.update({ where: { id: product.id }, data: { enabled: false } });
    return NextResponse.json({ disabled: true });
  }

  await prisma.productVariant.deleteMany({ where: { productId: product.id } });
  await prisma.product.delete({ where: { id: product.id } });
  return NextResponse.json({ deleted: true });
}
