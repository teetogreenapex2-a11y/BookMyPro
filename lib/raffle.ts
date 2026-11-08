import { prisma } from "@/lib/prisma";

export type RaffleTier = { label: string; count: number; prize: string; rest?: boolean };

export const DEFAULT_TIERS: RaffleTier[] = [
  { label: "Grand Prize", count: 1, prize: "Set of irons ($1,499 value)" },
  { label: "2nd Prize", count: 1, prize: "Ping G450 driver" },
  { label: "3rd Prize", count: 2, prize: "Ping G450 fairway wood" },
  { label: "4th Prize", count: 6, prize: "Mizuno wedge" },
  { label: "Everyone Else", count: 0, rest: true, prize: "$75 gift card" },
];

// Each raffle a business can run, by key. The key is the last part of its
// link: /{slug}/raffle (main) and /{slug}/raffle/200 (the 200/20 raffle).
export const RAFFLE_PRESETS: Record<string, {
  title: string; spaceCount: number; maxPerPerson: number; priceCents: number; giftCardCents: number; tiers: RaffleTier[];
}> = {
  main: { title: "50/50 Raffle", spaceCount: 50, maxPerPerson: 3, priceCents: 5000, giftCardCents: 7500, tiers: DEFAULT_TIERS },
  "200": {
    title: "200/20 Raffle", spaceCount: 20, maxPerPerson: 1, priceCents: 20000, giftCardCents: 20000, // 20 spots at $200 each; non-winners get their $200 back as a gift card
    tiers: [
      { label: "Grand Prize", count: 1, prize: "Full bag ($3,000 value)" },
      { label: "2nd Prize", count: 1, prize: "Set of irons ($1,500 value)" },
      { label: "3rd Prize", count: 1, prize: "Ping G450 driver ($650 value)" },
      { label: "Everyone Else", count: 0, rest: true, prize: "$200 gift card" },
    ],
  },
};

export function normalizeRaffleKey(raw: unknown) {
  const k = String(raw || "main");
  return RAFFLE_PRESETS[k] ? k : "main";
}

// Boards are created the first time their link is opened.
export async function getOrCreateBoard(businessId: string, rawKey: unknown = "main") {
  const key = normalizeRaffleKey(rawKey);
  const existing = await prisma.raffleBoard.findUnique({ where: { businessId_key: { businessId, key } } });
  const p = RAFFLE_PRESETS[key];
  if (existing) {
    // While nobody has claimed a space yet, keep the board in step with its
    // preset (so changing the preset here takes effect without a reset).
    const differs = existing.spaceCount !== p.spaceCount || existing.priceCents !== p.priceCents || existing.giftCardCents !== p.giftCardCents || existing.maxPerPerson !== p.maxPerPerson || existing.title !== p.title || JSON.stringify(existing.tiers) !== JSON.stringify(p.tiers);
    if (differs && existing.status === "open" && (await prisma.raffleSpace.count({ where: { boardId: existing.id } })) === 0) {
      return prisma.raffleBoard.update({ where: { id: existing.id }, data: { title: p.title, spaceCount: p.spaceCount, maxPerPerson: p.maxPerPerson, priceCents: p.priceCents, giftCardCents: p.giftCardCents, tiers: p.tiers as any } });
    }
    return existing;
  }
  return prisma.raffleBoard.create({ data: { businessId, key, title: p.title, spaceCount: p.spaceCount, maxPerPerson: p.maxPerPerson, priceCents: p.priceCents, giftCardCents: p.giftCardCents, tiers: p.tiers as any } });
}

// "Jane Smith" -> "Jane S." so the public board never shows full names.
export function publicName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return parts[0] || "";
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}
