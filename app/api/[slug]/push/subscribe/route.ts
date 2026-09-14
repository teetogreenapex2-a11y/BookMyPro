import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug, requireMembership } from "@/lib/tenant";

// POST /api/{slug}/push/subscribe  { endpoint, keys: { p256dh, auth } }
// Any role can subscribe now - players get booking/feedback notifications,
// instructors get booking/submission notifications, both share the same
// underlying mechanism.
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const membership = await requireMembership((session.user as any).id, business.id, ["owner", "instructor", "player"]);
  if (!membership) return NextResponse.json({ error: "Membership required" }, { status: 403 });

  const { endpoint, keys } = await req.json();
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return NextResponse.json({ error: "Invalid subscription data" }, { status: 400 });
  }

  // Upsert on the endpoint+membership pair (not the endpoint alone) -
  // this is what lets one browser/device stay registered for more than
  // one membership at once, rather than the newest registration
  // silently erasing an earlier one for a different account or role.
  await prisma.pushSubscription.upsert({
    where: { endpoint_membershipId: { endpoint, membershipId: membership.id } },
    update: { p256dh: keys.p256dh, auth: keys.auth },
    create: { membershipId: membership.id, endpoint, p256dh: keys.p256dh, auth: keys.auth },
  });

  return NextResponse.json({ ok: true });
}

// DELETE /api/{slug}/push/subscribe  { endpoint }
export async function DELETE(req: NextRequest, { params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const membership = await requireMembership((session.user as any).id, business.id, ["owner", "instructor", "player"]);
  if (!membership) return NextResponse.json({ error: "Membership required" }, { status: 403 });

  const { endpoint } = await req.json();
  if (!endpoint) return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });

  // Scoped to just this membership, same reasoning as the FCM route -
  // a wildcard delete on the endpoint alone would kill notifications
  // for every other account or role on this same browser too.
  await prisma.pushSubscription.deleteMany({ where: { endpoint, membershipId: membership.id } });
  return NextResponse.json({ ok: true });
}
