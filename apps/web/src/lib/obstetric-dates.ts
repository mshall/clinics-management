const DAY_MS = 86_400_000;

function parseIsoDate(value: unknown): Date | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Naegele's rule: EDD = LMP + 280 days (YYYY-MM-DD, UTC calendar). */
export function eddFromLmp(lmp: unknown): string | null {
  const d = parseIsoDate(lmp);
  if (!d) return null;
  return new Date(d.getTime() + 280 * DAY_MS).toISOString().slice(0, 10);
}

/** Gestational age on `today` as "Nw Nd"; null for future or > 45-week LMPs. */
export function gestationalAgeFromLmp(lmp: unknown, today: Date = new Date()): string | null {
  const d = parseIsoDate(lmp);
  if (!d) return null;
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const days = Math.floor((todayUtc - d.getTime()) / DAY_MS);
  if (days < 0 || days > 45 * 7) return null;
  return `${Math.floor(days / 7)}w ${days % 7}d`;
}

export function computeTemplateField(kind: string | undefined, source: unknown, today?: Date): string | null {
  if (kind === "EDD_FROM_LMP") return eddFromLmp(source);
  if (kind === "GA_FROM_LMP") return gestationalAgeFromLmp(source, today);
  return null;
}
