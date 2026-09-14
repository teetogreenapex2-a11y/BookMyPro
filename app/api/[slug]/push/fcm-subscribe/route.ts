import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug, requireMembership } from "@/lib/tenant";

// POST /api/{slug}/push/fcm-subscribe  { token }
// The native-app equivalent of /push/subscribe - saves a Firebase Cloud
// Messaging device token instead of a web push subscription. Any role can
// subscribe, same as the web version.
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const membership = await requireMembership((session.user as any).id, business.id, ["owner", "instructor", "player"]);
  if (!membership) return NextResponse.json({ error: "Membership required" }, { status: 403 });

  const { token } = await req.json();
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

  // Upsert on the token+membership pair (not the token alone) - this is
  // what actually lets one physical device stay registered for more than
  // one membership at once, rather than the newest registration silently
  // erasing an earlier one for a different account or role.
  await prisma.fcmToken.upsert({
    where: { token_membershipId: { token, membershipId: membership.id } },
    update: {},
    create: { membershipId: membership.id, token },
  });

  return NextResponse.json({ ok: true });
}

// DELETE /api/{slug}/push/fcm-subscribe  { token }
export async function DELETE(req: NextRequest, { params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const membership = await requireMembership((session.user as any).id, business.id, ["owner", "instructor", "player"]);
  if (!membership) return NextResponse.json({ error: "Membership required" }, { status: 403 });

  const { token } = await req.json();
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

  // Scoped to just this membership now that one token can hold several
  // at once - a wildcard delete on the token alone would silently kill
  // notifications for every other account or role on this same device
  // too, not just the one actually being disabled.
  await prisma.fcmToken.deleteMany({ where: { token, membershipId: membership.id } });
  return NextResponse.json({ ok: true });
}
