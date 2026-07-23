import { NextRequest } from "next/server";

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN;

export function businessDestination(slug: string, path: string) {
  if (ROOT_DOMAIN) return `https://${slug}.${ROOT_DOMAIN}${path}`;
  return `${process.env.NEXTAUTH_URL}/${slug}${path}`;
}

export function loginRedirectUrl(path: string) {
  return `/login?callbackUrl=${encodeURIComponent(path)}`;
}

export function getBusinessAbsoluteUrl(req: Request | NextRequest, slug: string, pagePath: string) {
  const host = (req.headers.get("host") || "").split(":")[0];
  if (ROOT_DOMAIN && host === `${slug}.${ROOT_DOMAIN}`) {
    const proto = req.headers.get("x-forwarded-proto") || (process.env.NODE_ENV === "production" ? "https" : "http");
    return `${proto}://${host}${pagePath}`;
  }
  return `${process.env.NEXTAUTH_URL}/${slug}${pagePath}`;
}

export function getBusinessApiUrl(req: Request | NextRequest, slug: string, apiPath: string) {
  const host = (req.headers.get("host") || "").split(":")[0];
  if (ROOT_DOMAIN && host === `${slug}.${ROOT_DOMAIN}`) {
    const proto = req.headers.get("x-forwarded-proto") || (process.env.NODE_ENV === "production" ? "https" : "http");
    return `${proto}://${host}/api${apiPath}`;
  }
  return `${process.env.NEXTAUTH_URL}/api/${slug}${apiPath}`;
}
