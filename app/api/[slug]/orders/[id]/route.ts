import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug, requireMembership } from "@/lib/tenant";

// PATCH /api/{slug}/orders/{id}  { status: "fulfilled" | "cancelled" }
// Owner only. Cancelling restores any stock that was reserved when the
// order was placed — the reservation happens at order creation (see
// /orders POST), not at payment, so cancelling has to give it back.
export async function PATCH(req: NextRequest, { params }: { params: { slug: string; id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const membership = await requireMembership((session.user as any).id, business.id, ["owner"]);
  if (!membership) return NextResponse.json({ error: "Owner access required" }, { status: 403 });

  const order = await prisma.order.findFirst({
    where: { id: params.id, businessId: business.id },
    include: { items: true },
  });
  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { status } = await req.json();
  if (status !== "fulfilled" && status !== "cancelled") {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  if (status === "cancelled" && order.status !== "cancelled") {
    for (const item of order.items) {
      if (item.variantId) {
        await prisma.productVariant.update({ where: { id: item.variantId }, data: { stockQuantity: { increment: item.quantity } } });
      } else {
        const product = await prisma.product.findUnique({ where: { id: item.productId } });
        if (product?.stockQuantity !== null && product?.stockQuantity !== undefined) {
          await prisma.product.update({ where: { id: item.productId }, data: { stockQuantity: { increment: item.quantity } } });
        }
      }
    }
  }

  const updated = await prisma.order.update({ where: { id: order.id }, data: { status } });
  return NextResponse.json(updated);
}
