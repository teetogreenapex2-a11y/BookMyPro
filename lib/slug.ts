import { prisma } from "./prisma";

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "business";
}

// Appends -2, -3, etc. until it finds a slug that isn't taken.
export async function generateUniqueSlug(base: string): Promise<string> {
  const root = slugify(base);
  let candidate = root;
  let suffix = 2;

  while (await prisma.business.findUnique({ where: { slug: candidate } })) {
    candidate = `${root}-${suffix}`;
    suffix++;
  }

  return candidate;
}
