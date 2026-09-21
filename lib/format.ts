// Small display-formatting helpers shared across the public-facing pages
// (Find a Pro search, business profile headers) - not validation, just
// cleanup so what a pro typed into a plain text field always reads back
// properly capitalized, regardless of how they typed it in.

// "chapel hill" -> "Chapel Hill". Deliberately simple (just capitalizes
// each word) rather than a full locale-aware title-case implementation -
// city and state names don't have the lowercase "of"/"the" exceptions
// that make general title-casing hard.
export function titleCase(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// A state is either a 2-letter code ("NC") or a full name ("North
// Carolina") - short values get upper-cased instead of title-cased so an
// abbreviation typed as "nc" comes back "NC", not "Nc".
export function formatState(value: string): string {
  const trimmed = value.trim();
  return trimmed.length <= 3 ? trimmed.toUpperCase() : titleCase(trimmed);
}

// Joins city + state for display, trimming each piece first so a stray
// trailing space on one of them (e.g. "chapel hill " saved from an old
// onboarding form) can't produce "Chapel Hill , NC" - the extra space
// before the comma was coming from the stored value, not the join itself.
export function formatCityState(city?: string | null, state?: string | null): string {
  const parts: string[] = [];
  if (city && city.trim()) parts.push(titleCase(city));
  if (state && state.trim()) parts.push(formatState(state));
  return parts.join(", ");
}
