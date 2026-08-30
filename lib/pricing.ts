export const PACKAGES = [
  { id: "single", label: "Single lesson", lessons: 1 },
  { id: "playing", label: "Playing lesson", lessons: 1 },
  { id: "video", label: "Video lesson", lessons: 1 },
  { id: "three", label: "3-pack", lessons: 3 },
  { id: "five", label: "5-pack", lessons: 5 },
  { id: "ten", label: "10-pack", lessons: 10 },
] as const;

export const FITTING_TYPES = [
  { id: "driver", label: "Driver fitting", durationMin: 45 },
  { id: "iron", label: "Iron fitting", durationMin: 60 },
  { id: "full", label: "Full bag fitting", durationMin: 90 },
] as const;

export function centsToDollars(cents: number) {
  return `$${(cents / 100).toFixed(0)}`;
}

export function findPackage(id: string) {
  return PACKAGES.find((p) => p.id === id);
}

export function findFitting(id: string) {
  return FITTING_TYPES.find((f) => f.id === id);
}

// Resolves a specific duration + optional package size into what's
// actually being purchased - takes the already-fetched list of
// durations (with their packages nested inside), since these are live,
// per-instructor database rows an instructor can add/edit/remove at
// any time, not a fixed set of platform constants the way the old
// single/three/five/ten packages are. Returns null if the ids given
// don't actually resolve to anything real for this instructor - the
// caller should treat that as a rejected purchase attempt, never fall
// back to a default price.
export function resolveDurationPurchase(
  durations: { id: string; minutes: number; singlePriceCents: number; packages: { id: string; lessonsCount: number; priceCents: number }[] }[],
  durationId: string,
  packageOptionId?: string | null
) {
  const duration = durations.find((d) => d.id === durationId);
  if (!duration) return null;

  if (!packageOptionId) {
    return { minutes: duration.minutes, lessonsTotal: 1, priceCents: duration.singlePriceCents, packageOptionId: null as string | null };
  }
  const option = duration.packages.find((p) => p.id === packageOptionId);
  if (!option) return null;
  return { minutes: duration.minutes, lessonsTotal: option.lessonsCount, priceCents: option.priceCents, packageOptionId: option.id };
}

// BusinessSettings stores per-item price + enabled state under fields like
// packageThreePriceCents / packageThreeEnabled or fittingDriverPriceCents /
// fittingDriverEnabled. These helpers read the right field for a given id so
// pricing is always driven by the database, never trusted from the client.
type BusinessSettingsLike = Record<string, any>;

function fieldPrefix(kind: "package" | "fitting", id: string) {
  return kind + id.charAt(0).toUpperCase() + id.slice(1);
}

export function getPackagePriceCents(business: BusinessSettingsLike, packageId: string): number {
  return business[`${fieldPrefix("package", packageId)}PriceCents`] ?? 0;
}

// A package priced at $0 isn't "free" — it means the instructor hasn't set
// a real price yet (defaults to 0 cents until they do). Used to show "TBD"
// to players and to block checkout until a real price is configured.
export function isPackagePriceSet(business: BusinessSettingsLike, packageId: string): boolean {
  return getPackagePriceCents(business, packageId) > 0;
}

export function isPackageEnabled(business: BusinessSettingsLike, packageId: string): boolean {
  return business[`${fieldPrefix("package", packageId)}Enabled`] ?? false;
}

export function enabledPackages(business: BusinessSettingsLike) {
  return PACKAGES.filter((p) => isPackageEnabled(business, p.id)).map((p) => ({
    ...p,
    priceCents: getPackagePriceCents(business, p.id),
  }));
}

export function getFittingPriceCents(business: BusinessSettingsLike, fittingId: string): number {
  return business[`${fieldPrefix("fitting", fittingId)}PriceCents`] ?? 0;
}

export function isFittingEnabled(business: BusinessSettingsLike, fittingId: string): boolean {
  return business[`${fieldPrefix("fitting", fittingId)}Enabled`] ?? false;
}

export function enabledFittings(business: BusinessSettingsLike) {
  return FITTING_TYPES.filter((f) => isFittingEnabled(business, f.id)).map((f) => ({
    ...f,
    priceCents: getFittingPriceCents(business, f.id),
  }));
}

// Custom offerings don't have a fixed id/label the way packages and
// fittings do - each instructor names their own, so a slot is simply
// "in use" whenever it has a name at all, with no separate enabled flag.
export function customOfferings(membership: BusinessSettingsLike) {
  const slots: { slot: number; name: string; priceCents: number }[] = [];
  for (let i = 1; i <= 4; i++) {
    const name = membership[`customOffering${i}Name`];
    if (typeof name === "string" && name.trim()) {
      slots.push({ slot: i, name: name.trim(), priceCents: membership[`customOffering${i}PriceCents`] ?? 0 });
    }
  }
  return slots;
}
