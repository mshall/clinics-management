/** MS-04 — quiet hours (local clock) and opt-out for staff digests / CR-07 nudges. */

export type DigestKind =
  | "doctor_tomorrow"
  | "owner_weekly"
  | "owner_shift"
  | "kiorex_progress"
  | "monthly_recap";

export type DigestPrefsLike = {
  optOutAll: boolean;
  doctorTomorrowList: boolean;
  ownerWeeklyInsights: boolean;
  ownerShiftSummaries: boolean;
  kiorexProgressNudges: boolean;
  quietHoursStart: number;
  quietHoursEnd: number;
};

export const DEFAULT_DIGEST_PREFS: DigestPrefsLike = {
  optOutAll: false,
  doctorTomorrowList: true,
  ownerWeeklyInsights: true,
  ownerShiftSummaries: true,
  kiorexProgressNudges: true,
  quietHoursStart: 21,
  quietHoursEnd: 8,
};

/** Quiet when start === end → never quiet. Otherwise [start, end) wrapping midnight. */
export function isInQuietHours(localHour: number, start: number, end: number): boolean {
  const h = ((localHour % 24) + 24) % 24;
  const s = clampHour(start);
  const e = clampHour(end);
  if (s === e) return false;
  if (s < e) return h >= s && h < e;
  return h >= s || h < e;
}

function clampHour(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(23, Math.max(0, Math.trunc(n)));
}

export function digestChannelEnabled(prefs: DigestPrefsLike, kind: DigestKind): boolean {
  if (prefs.optOutAll) return false;
  switch (kind) {
    case "doctor_tomorrow":
      return prefs.doctorTomorrowList;
    case "owner_weekly":
      return prefs.ownerWeeklyInsights;
    case "owner_shift":
      return prefs.ownerShiftSummaries;
    case "kiorex_progress":
    case "monthly_recap":
      return prefs.kiorexProgressNudges;
    default:
      return false;
  }
}

/** True when this kind may be delivered at the given local hour. */
export function mayDeliverDigest(prefs: DigestPrefsLike, kind: DigestKind, localHour: number): boolean {
  if (!digestChannelEnabled(prefs, kind)) return false;
  return !isInQuietHours(localHour, prefs.quietHoursStart, prefs.quietHoursEnd);
}

/** Local hour (0–23) of an instant in a timezone. */
export function localHour(d: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "numeric", hourCycle: "h23" }).formatToParts(d);
  return Number(parts.find((p) => p.type === "hour")?.value ?? "0");
}

/** Calendar date YYYY-MM-DD in a timezone. */
export function localDateKey(d: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** ISO week key YYYY-Www in a timezone (Monday-based). */
export function localWeekKey(d: Date, timeZone: string): string {
  const date = localDateKey(d, timeZone);
  const [y, m, day] = date.split("-").map(Number);
  const utc = new Date(Date.UTC(y!, m! - 1, day!));
  const dow = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - dow);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((utc.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function normalizeDigestPrefs(input: Partial<DigestPrefsLike> | null | undefined): DigestPrefsLike {
  const base = { ...DEFAULT_DIGEST_PREFS };
  if (!input) return base;
  return {
    optOutAll: Boolean(input.optOutAll),
    doctorTomorrowList: input.doctorTomorrowList !== false,
    ownerWeeklyInsights: input.ownerWeeklyInsights !== false,
    ownerShiftSummaries: input.ownerShiftSummaries !== false,
    kiorexProgressNudges: input.kiorexProgressNudges !== false,
    quietHoursStart: clampHour(Number(input.quietHoursStart ?? base.quietHoursStart)),
    quietHoursEnd: clampHour(Number(input.quietHoursEnd ?? base.quietHoursEnd)),
  };
}
