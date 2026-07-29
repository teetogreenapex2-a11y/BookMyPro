import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug, requireMembership } from "@/lib/tenant";

// DELETE /api/{slug}/players/{id}  ?force=true to proceed despite a warning
// Removes the player's Membership at this business only - their User
// account, and every booking/package/gift card/video tied to it, stay
// completely intact. This just takes them off the active customer list;
// it does not touch financial or booking history, which a real business
// needs to keep regardless of whether someone's still an active customer.
export async function DELETE(req: NextRequest, { params }: { params: { slug: string; id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const membership = await requireMembership((session.user as any).id, business.id, ["owner", "instructor"]);
  if (!membership) return NextResponse.json({ error: "Instructor access required" }, { status: 403 });

  const playerMembership = await prisma.membership.findFirst({
    where: { userId: params.id, businessId: business.id, role: "player" },
  });
  if (!playerMembership) return NextResponse.json({ error: "Customer not found" }, { status: 404 });

  const force = req.nextUrl.searchParams.get("force") === "true";

  if (!force) {
    const activePackages = await prisma.package.findMany({
      where: { userId: params.id, businessId: business.id, lessonsRemaining: { gt: 0 } },
    });
    if (activePackages.length > 0) {
      const totalRemaining = activePackages.reduce((sum, p) => sum + p.lessonsRemaining, 0);
      return NextResponse.json(
        {
          warning: true,
          message: `This customer has ${totalRemaining} unused lesson${totalRemaining === 1 ? "" : "s"} from ${activePackages.length} package${activePackages.length === 1 ? "" : "s"} they've already paid for. Deleting them won't refund or destroy those credits, but you won't be able to see or use them from your customer list anymore.`,
        },
        { status: 409 }
      );
    }
  }

  await prisma.membership.delete({ where: { id: playerMembership.id } });
  return NextResponse.json({ deleted: true });
}

// PATCH /api/{slug}/players/{id}  { name?, phone? }
// Lets an instructor fix up a customer's name (or phone) directly - most
// often needed for anyone who signed in via the email magic link instead
// of Google, since that path never collects a real name the way Google's
// sign-in does, leaving it blank until someone sets it manually.
export async function PATCH(req: NextRequest, { params }: { params: { slug: string; id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const membership = await requireMembership((session.user as any).id, business.id, ["owner", "instructor"]);
  if (!membership) return NextResponse.json({ error: "Instructor access required" }, { status: 403 });

  const playerMembership = await prisma.membership.findFirst({
    where: { userId: params.id, businessId: business.id, role: "player" },
  });
  if (!playerMembership) return NextResponse.json({ error: "Customer not found" }, { status: 404 });

  const { name, phone } = await req.json();
  const data: Record<string, unknown> = {};
  if (typeof name === "string" && name.trim()) data.name = name.trim();
  if (typeof phone === "string") data.phone = phone.trim() || null;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const updated = await prisma.user.update({ where: { id: params.id }, data });
  return NextResponse.json({ id: updated.id, name: updated.name, phone: updated.phone });
}
