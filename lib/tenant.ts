import { prisma } from "./prisma";
import { headers } from "next/headers";

// The central helpers every tenant-scoped page and API route builds on.
// Pattern for a page:  const business = await getBusinessBySlug(params.slug)
// Pattern for an API route: const membership = await requireMembership(userId, businessId, ["owner", "instructor"])

// Called from a page's Server Component to work out how its client component
// should build internal links and fetch() calls — with a slug prefix
// (/{slug}/book, /api/{slug}/availability) when accessed path-based, or
// without one (/book, /api/availability) when accessed via the business's
// own subdomain, since middleware.ts already rewrote the request by then.
export function getBasePaths(slug: string) {
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN;
  const host = (headers().get("host") || "").split(":")[0];
  const onSubdomain = !!rootDomain && host === `${slug}.${rootDomain}`;
  return {
    basePath: onSubdomain ? "" : `/${slug}`,
    apiBase: onSubdomain ? "/api" : `/api/${slug}`,
  };
}

export async function getBusinessBySlug(slug: string) {
  return prisma.business.findUnique({ where: { slug } });
}

export async function getMembership(userId: string, businessId: string) {
  return prisma.membership.findUnique({
    where: { userId_businessId: { userId, businessId } },
  });
}

// Throws-free guard: returns the Membership if the user has one of the
// allowed roles at this business, otherwise null. Callers turn a null into
// a 403/redirect as appropriate for a route vs. a page.
export async function requireMembership(
  userId: string,
  businessId: string,
  allowedRoles: Array<"owner" | "instructor" | "player">
) {
  const membership = await getMembership(userId, businessId);
  if (!membership || membership.status !== "active" || !allowedRoles.includes(membership.role as any)) return null;
  return membership;
}

// Every staff member (owner or instructor role) a player can choose to book
// with — a business with multiple instructors on staff shows all of them.
// includeInactive is for the owner's own Team management view in Settings
// (see the deactivate/reactivate feature) - the public booking flow never
// wants a deactivated instructor showing up as a bookable option, so it
// stays false there.
export async function getBusinessInstructors(businessId: string, includeInactive = false) {
  return prisma.membership.findMany({
    where: {
      businessId,
      role: { in: ["owner", "instructor"] },
      status: includeInactive ? { in: ["active", "inactive"] } : "active",
    },
    include: { user: { select: { id: true, name: true, email: true, image: true } } },
    orderBy: { createdAt: "asc" },
  });
}

// Looks up a specific instructor by their Membership id, scoped to this
// business — used once a booking already has a chosen instructor, e.g. for
// syncing the calendar event to *that* person's calendar specifically,
// rather than "the business's instructor" generically.
export async function getInstructorById(businessId: string, membershipId: string) {
  return prisma.membership.findFirst({
    where: { id: membershipId, businessId, role: { in: ["owner", "instructor"] } },
    include: { user: true },
  });
}

// Works out who actually gets emailed about a new booking, based on the
// business's own preference - just the instructor it was actually with,
// just the owner (the old, hardcoded default), or both. A real gap
// before this existed: every booking notification always went to one
// fixed, business-wide address regardless of which instructor a
// booking was actually with, so a second instructor never heard about
// their own bookings at all.
export async function getBookingNotificationRecipients(
  business: { id: string; notificationEmail: string | null; email: string; bookingNotifyTarget: string },
  instructorMembershipId: string | null | undefined
) {
  const ownerEmail = business.notificationEmail || business.email || null;
  const target = business.bookingNotifyTarget || "owner";

  let instructorEmail: string | null = null;
  if (instructorMembershipId && (target === "instructor" || target === "both")) {
    const instructor = await prisma.membership.findUnique({
      where: { id: instructorMembershipId },
      include: { user: { select: { email: true } } },
    });
    instructorEmail = instructor?.user.email || null;
  }

  const recipients =
    target === "instructor" ? [instructorEmail]
    : target === "both" ? [instructorEmail, ownerEmail]
    : [ownerEmail];

  // De-duplicated - the owner and the instructor are sometimes the same
  // real person (e.g. the owner booking a slot on their own calendar),
  // and nobody wants the same email twice.
  return [...new Set(recipients.filter((e): e is string => !!e))];
}

// Ensures a Membership exists for a user at a business, creating one with
// the given role if it doesn't. Useful the first time a player books with
// a business, or when an owner completes onboarding.
export async function ensureMembership(userId: string, businessId: string, role: "owner" | "instructor" | "player") {
  return prisma.membership.upsert({
    where: { userId_businessId: { userId, businessId } },
    update: {},
    create: { userId, businessId, role },
  });
}

// There's no dedicated platform-admin role yet - this app is genuinely a
// single-admin operation right now, so admin access is gated the same
// practical way as everything else that needed a real person to review
// something: whoever owns the one real, known business on the platform.
export async function isPlatformAdmin(userId: string) {
  const adminBusiness = await prisma.business.findUnique({ where: { slug: "tee-to-green-golf" } });
  if (!adminBusiness) return false;
  const membership = await prisma.membership.findUnique({
    where: { userId_businessId: { userId, businessId: adminBusiness.id } },
  });
  return membership?.role === "owner" && membership.status === "active";
}
