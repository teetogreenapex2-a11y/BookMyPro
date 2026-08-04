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

  // A device's FCM token is unique - upsert so re-registering (e.g. after
  // reinstalling the app) doesn't create duplicate rows for the same
  // real device.
  await prisma.fcmToken.upsert({
    where: { token },
    update: { membershipId: membership.id },
    create: { membershipId: membership.id, token },
  });

  return NextResponse.json({ ok: true });
}

// DELETE /api/{slug}/push/fcm-subscribe  { token }
export async function DELETE(req: NextRequest, { params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const { token } = await req.json();
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

  await prisma.fcmToken.deleteMany({ where: { token } });
  return NextResponse.json({ ok: true });
}
