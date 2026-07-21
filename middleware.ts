import { NextRequest, NextResponse } from "next/server";

// Set this to your platform's root domain once you own one, e.g. "teetogreen.app".
// Until then (or on localhost/Vercel preview URLs), this middleware does nothing
// and the app continues working purely via path-based routing (/{slug}/book).
const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN;

export function middleware(req: NextRequest) {
  if (!ROOT_DOMAIN) return NextResponse.next();

  const host = (req.headers.get("host") || "").split(":")[0]; // strip port for local testing
  const url = req.nextUrl;

  // Not a subdomain of our root domain (includes localhost, the root domain
  // itself, Vercel preview URLs, etc.) — leave the request untouched, so
  // path-based URLs (yourapp.com/{slug}/book) keep working everywhere.
  if (host === ROOT_DOMAIN || !host.endsWith(`.${ROOT_DOMAIN}`)) {
    return NextResponse.next();
  }

  const subdomain = host.slice(0, -(ROOT_DOMAIN.length + 1));

  // "www" isn't a business — send it to the root domain instead of trying
  // to look up a business called "www".
  if (subdomain === "www") {
    url.host = ROOT_DOMAIN;
    return NextResponse.redirect(url);
  }

  // The actual rewrite: teetogreen.rootdomain.com/book internally becomes
  // /teetogreen/book (or /api/teetogreen/availability for API routes) —
  // matching the existing [slug] route structure exactly. The browser URL
  // bar is untouched; this only affects what Next.js matches internally.
  url.pathname = `/${subdomain}${url.pathname}`;
  return NextResponse.rewrite(url);
}

export const config = {
  // Run on everything except static assets and Next internals.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
