import type { MetadataRoute } from "next";

// The features page is meant for prospective customers going through
// onboarding, not for public discovery - a competitor shouldn't be able
// to find a full rundown of everything the app does just by searching
// Google. Everything else (business booking pages, the homepage, etc.)
// stays normally crawlable, since those genuinely benefit from being
// findable.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: "/features",
    },
  };
}
