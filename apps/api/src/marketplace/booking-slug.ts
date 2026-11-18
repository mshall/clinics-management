/** KX-09 booking page slugs: lowercase ASCII words joined by single hyphens. */
export const BOOKING_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const BOOKING_SLUG_MIN = 3;
export const BOOKING_SLUG_MAX = 40;

const RESERVED = new Set(["admin", "api", "app", "b", "book", "kiorex", "kiorly", "login", "public", "www"]);

export const BOOKING_SLUG_ERROR = {
  INVALID: "INVALID_BOOKING_SLUG",
  TAKEN: "BOOKING_SLUG_TAKEN",
} as const;

export function isValidBookingSlug(slug: string): boolean {
  return (
    slug.length >= BOOKING_SLUG_MIN &&
    slug.length <= BOOKING_SLUG_MAX &&
    BOOKING_SLUG_PATTERN.test(slug) &&
    !RESERVED.has(slug)
  );
}

/** Best-effort slug from a display name; falls back to `fallback` when nothing ASCII survives (e.g. Arabic-only names). */
export function slugifyBookingName(name: string, fallback: string): string {
  const base = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, BOOKING_SLUG_MAX - 5)
    .replace(/-+$/g, "");
  const candidate = base.length >= BOOKING_SLUG_MIN && !RESERVED.has(base) ? base : fallback;
  return candidate;
}

/** Candidate list: base, then base-2 … base-9, then base + random suffix. */
export function bookingSlugCandidates(base: string, random: () => string): string[] {
  const out = [base];
  for (let i = 2; i <= 9; i += 1) out.push(`${base}-${i}`);
  out.push(`${base}-${random()}`);
  return out.filter((s) => s.length <= BOOKING_SLUG_MAX);
}
