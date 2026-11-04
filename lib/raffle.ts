import { prisma } from "@/lib/prisma";

export type RaffleTier = { label: string; count: number; prize: string; rest?: boolean };

export const DEFAULT_TIERS: RaffleTier[] = [
  { label: "Grand Prize", count: 1, prize: "Set of irons ($1,499 value)" },
  { label: "2nd Prize", count: 1, prize: "Ping G450 driver" },
  { label: "3rd Prize", count: 2, prize: "Ping G450 fairway wood" },
  { label: "4th Prize", count: 6, prize: "Mizuno wedge" },
  { label: "Everyone Else", count: 0, rest: true, prize: "$75 gift card" },
];

export async function getOrCreateBoard(businessId: string) {
  const existing = await prisma.raffleBoard.findUnique({ where: { businessId } });
  if (existing) return existing;
  return prisma.raffleBoard.create({ data: { businessId, tiers: DEFAULT_TIERS as any } });
}

// "Jane Smith" -> "Jane S." so the public board never shows full names.
export function publicName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return parts[0] || "";
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}
