import { NextRequest } from "next/server";

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN;

// For redirects issued from a Server Component (e.g. app/page.tsx sending an
// existing member to their business) or an API route (e.g. after Google
// Calendar OAuth completes) where there's no incoming NextRequest host to
// mirror — always prefers the subdomain form once ROOT_DOMAIN is set, since
// that's the canonical URL for a business either way. Always returns an
// *absolute* URL: NextResponse.redirect() in a Route Handler rejects
// relative paths (unlike in Middleware, where they're allowed).
export function businessDestination(slug: string, path: string) {
  if (ROOT_DOMAIN) return `https://${slug}.${ROOT_DOMAIN}${path}`;
  return `${process.env.NEXTAUTH_URL}/${slug}${path}`;
}

// For API routes building an absolute URL to redirect back to *after* an
// external flow (Stripe onboarding, Google OAuth) — mirrors whatever mode
// the incoming request actually arrived in, so a business using path-based
// access doesn't get bounced onto a subdomain they've never used, and vice
// versa. Accepts any Request-like object (NextRequest extends Request).
// `pagePath` is a page route like "/settings?stripe=connected".
export function getBusinessAbsoluteUrl(req: Request | NextRequest, slug: string, pagePath: string) {
  const host = (req.headers.get("host") || "").split(":")[0];
  if (ROOT_DOMAIN && host === `${slug}.${ROOT_DOMAIN}`) {
    const proto = req.headers.get("x-forwarded-proto") || (process.env.NODE_ENV === "production" ? "https" : "http");
    return `${proto}://${host}${pagePath}`;
  }
  return `${process.env.NEXTAUTH_URL}/${slug}${pagePath}`;
}

// Same idea, but for an *API* route like "/stripe/connect" (i.e. what comes
// after "/api" and the slug) — kept separate from getBusinessAbsoluteUrl
// because page paths and API paths prefix differently in path-based mode
// (/{slug}/settings vs /api/{slug}/stripe/connect, not /{slug}/api/...).
export function getBusinessApiUrl(req: Request | NextRequest, slug: string, apiPath: string) {
  const host = (req.headers.get("host") || "").split(":")[0];
  if (ROOT_DOMAIN && host === `${slug}.${ROOT_DOMAIN}`) {
    const proto = req.headers.get("x-forwarded-proto") || (process.env.NODE_ENV === "production" ? "https" : "http");
    return `${proto}://${host}/api${apiPath}`;
  }
  return `${process.env.NEXTAUTH_URL}/api/${slug}${apiPath}`;
}
