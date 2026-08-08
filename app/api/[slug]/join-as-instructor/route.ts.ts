import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug, getMembership } from "@/lib/tenant";
import { getBusinessAbsoluteUrl } from "@/lib/businessUrl";
import { sendInstructorRequestNotification } from "@/lib/email";

// POST /api/{slug}/join-as-instructor  { name, email, phone, message? }
// Creates (or updates an existing player's membership into) a pending
// instructor request - deliberately not real access on its own. See
// requireMembership() in lib/tenant.ts, which treats anything other than
// an "active" status as no membership at all for every access check in
// the app, so nothing here grants real instructor access until the
// owner explicitly approves it.
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const body = await req.json();
  const { name, email, phone, message } = body;
  if (!name?.trim() || !email?.trim() || !phone?.trim()) {
    return NextResponse.json({ error: "Name, email, and phone are all required" }, { status: 400 });
  }

  const userId = (session.user as any).id;
  const existing = await getMembership(userId, business.id);

  if (existing && existing.status === "active" && (existing.role === "owner" || existing.role === "instructor")) {
    return NextResponse.json({ error: "You already have instructor access here" }, { status: 400 });
  }

  await prisma.membership.upsert({
    where: { userId_businessId: { userId, businessId: business.id } },
    update: { role: "instructor", status: "pending" },
    create: { userId, businessId: business.id, role: "instructor", status: "pending" },
  });

  const reviewUrl = getBusinessAbsoluteUrl(req, params.slug, "/settings");
  await sendInstructorRequestNotification(business.notificationEmail || business.email, {
    businessName: business.name,
    applicantName: name.trim(),
    applicantEmail: email.trim(),
    applicantPhone: phone.trim(),
    message: message?.trim() || "",
    reviewUrl,
  });

  return NextResponse.json({ ok: true });
}
