/** TanStack Query defaults — balance freshness vs. fewer round trips. */
export const QUERY_STALE = {
  /** Clinics, org settings, nav — change infrequently. */
  reference: 5 * 60_000,
  /** Lists that change often (patients search, appointments). */
  list: 45_000,
  /** Admin/HR summaries. */
  summary: 90_000,
  /** Detail panels. */
  detail: 2 * 60_000,
} as const;

export const QUERY_GC = 15 * 60_000;