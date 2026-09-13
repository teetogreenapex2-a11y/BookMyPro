import type { MetadataRoute } from "next";
import { REGION_CITIES } from "@/lib/regionCities";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://bookmypro.app";
  const now = new Date();

  const staticPages: MetadataRoute.Sitemap = [
    { url: base, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/find-a-pro`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${base}/support`, lastModified: now, changeFrequency: "monthly", priority: 0.3 },
    { url: `${base}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
  ];

  const cityPages: MetadataRoute.Sitemap = REGION_CITIES.map((c) => ({
    url: `${base}/find-a-pro/${c.slug}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  return [...staticPages, ...cityPages];
}
