import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBusinessBySlug, getMembership } from "@/lib/tenant";

// POST /api/{slug}/sandbox-links/quick  { name, role: "instructor" | "player" }
//
// Owner-only. The other two sandbox-link routes (instructors/{id} and
// players/{id}) only work for someone already on the team or customer
// list - fine for previewing the app to an existing contact, but no help
// for cold-emailing a list of prospective instructors who don't have any
// account here yet. This route creates a throwaway User + Membership
// just for that one invite (isSandboxProspect: true keeps it out of the
// real Team and Customers lists entirely - see lib/tenant.ts and
// {slug}/customers), then hands back a link exactly like the other two.
// A brand new membership per prospect, rather than one shared account
// reused for everyone, so two people previewing at the same time never
// see or clobber each other's changes.
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const business = await getBusinessBySlug(params.slug);
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const requesterMembership = await getMembership((session.user as any).id, business.id);
  if (requesterMembership?.role !== "owner") {
    return NextResponse.json({ error: "Only the owner can generate a sandbox link" }, { status: 403 });
  }

  const { name, role } = await req.json();
  if (typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "Enter a name for this invite" }, { status: 400 });
  }
  if (role !== "instructor" && role !== "player") {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }
  const trimmedName = name.trim().slice(0, 80);

  // .invalid is the reserved TLD for exactly this - an address that will
  // never resolve or receive mail, so nothing in the app can ever
  // accidentally email this placeholder account.
  const prospectUser = await prisma.user.create({
    data: {
      name: `${trimmedName} (sandbox prospect)`,
      email: `sandbox-${randomBytes(8).toString("hex")}@bookmypro.invalid`,
      emailReminders: false,
      textReminders: false,
    },
  });

  const prospectMembership = await prisma.membership.create({
    data: {
      userId: prospectUser.id,
      businessId: business.id,
      role,
      isSandboxProspect: true,
      // Only matters for the instructor role, but harmless either way -
      // keeps this placeholder off the real booking picker too, on the
      // off chance it's ever queried without the isSandboxProspect filter.
      hiddenFromBooking: true,
    },
  });

  const SESSION_LIFETIME_MS = 14 * 24 * 60 * 60 * 1000; // two weeks, matching the invite email copy
  const sessionToken = randomBytes(32).toString("hex");
  await prisma.session.create({
    data: {
      sessionToken,
      userId: prospectUser.id,
      expires: new Date(Date.now() + SESSION_LIFETIME_MS),
    },
  });

  const handoff = await prisma.nativeAuthHandoff.create({
    data: {
      sessionToken,
      callbackUrl: role === "instructor" ? `/${params.slug}/instructor?preview=app` : `/${params.slug}/book?preview=app`,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      businessId: business.id,
      recipientName: trimmedName,
      recipientRole: role,
    },
  });

  const base = process.env.NEXTAUTH_URL || "https://bookmypro.app";
  return NextResponse.json({ url: `${base}/api/auth/redeem-sandbox-link/${handoff.token}`, membershipId: prospectMembership.id });
}
