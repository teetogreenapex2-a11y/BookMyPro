import type { Metadata } from "next";
import { getBusinessBySlug } from "./tenant";

// Every [slug]-scoped page falls back to the root layout's hardcoded
// metadata ("Tee to Green Golf / Book golf lessons and club fittings")
// without this - which meant every business on BookMyPro had its own
// booking page, dashboard, settings, etc. all showing one specific golf
// shop's name in the browser tab and any search result, regardless of
// whose business it actually was. `label` is the specific page
// ("Book a lesson", "Settings", ...); the business's own name gets
// appended so the tab reads "{label} | {business.name}".
export async function businessPageMetadata(slug: string, label: string): Promise<Metadata> {
  const business = await getBusinessBySlug(slug);
  if (!business) return {};
  return { title: `${label} | ${business.name}` };
}
