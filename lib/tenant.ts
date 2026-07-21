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
  if (!membership || !allowedRoles.includes(membership.role as any)) return null;
  return membership;
}

// The instructor for a business — used anywhere the app currently assumes
// "the" single instructor (calendar sync, booking confirmations, etc.).
// Multiple instructors per business isn't modeled yet; this returns the
// first one found, matching today's single-instructor behavior per business.
export async function getBusinessInstructor(businessId: string) {
  const membership = await prisma.membership.findFirst({
    where: { businessId, role: { in: ["owner", "instructor"] }, googleRefreshToken: { not: null } },
    include: { user: true },
  });
  return membership;
}

// Every staff member (owner or instructor role) a player can choose to book
// with — a business with multiple instructors on staff shows all of them.
export async function getBusinessInstructors(businessId: string) {
  return prisma.membership.findMany({
    where: { businessId, role: { in: ["owner", "instructor"] } },
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
