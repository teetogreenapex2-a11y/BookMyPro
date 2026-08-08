import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateUniqueSlug, slugify } from "@/lib/slug";
import { seedInstructorAvailability } from "@/lib/seedAvailability";
import { businessDestination } from "@/lib/businessUrl";
import { sendNewBusinessNotification } from "@/lib/email";

// POST /api/businesses  { name, email?, hours?, lessonRate?, slug? }
// Creates a new Business, makes the current user its "owner", and seeds
// 4 weeks of open availability so the calendar isn't empty on day one.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const body = await req.json();
  const name = (body.name || "").trim();
  if (!name) return NextResponse.json({ error: "Business name is required" }, { status: 400 });

  // Let the person pick their own slug if they want, but always fall back to
  // an auto-generated + uniqueness-checked one derived from the name.
  const requestedSlug = body.slug ? slugify(body.slug) : null;
  const slugTaken = requestedSlug ? await prisma.business.findUnique({ where: { slug: requestedSlug } }) : null;
  const slug = requestedSlug && !slugTaken ? requestedSlug : await generateUniqueSlug(name);

  const userId = (session.user as any).id;

  const business = await prisma.business.create({
    data: {
      slug,
      name,
      approved: false,
      email: (body.email || "").trim(),
      hours: body.hours?.trim() || undefined,
      lessonRate: body.lessonRate?.trim() || undefined,
    },
  });

  const ownerMembership = await prisma.membership.create({
    data: { userId, businessId: business.id, role: "owner" },
  });

  await seedInstructorAvailability(business.id, ownerMembership.id, business.bookingWindowDays);

  // The platform admin has no dedicated login/role of their own yet -
  // this app is still genuinely a single-admin operation right now, so
  // notifications for anything platform-wide go to whoever owns the
  // one real, known business, same as everything else tonight that
  // needed an actual person to review something.
  const admin = await prisma.business.findUnique({ where: { slug: "tee-to-green-golf" } });
  await sendNewBusinessNotification(admin?.notificationEmail || admin?.email, {
    businessName: business.name,
    ownerName: session.user?.name || "",
    ownerEmail: session.user?.email || "",
    reviewUrl: `${process.env.NEXTAUTH_URL}/admin/pending-businesses`,
  });

  return NextResponse.json({
    slug: business.slug,
    url: businessDestination(business.slug, "/instructor"),
    ownerMembershipId: ownerMembership.id,
  }, { status: 201 });
}

// GET /api/businesses?slug=...  — used by the onboarding form to check
// slug availability live, before the person submits.
export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug");
  if (!slug) return NextResponse.json({ error: "slug is required" }, { status: 400 });

  const existing = await prisma.business.findUnique({ where: { slug: slugify(slug) } });
  return NextResponse.json({ available: !existing });
}
