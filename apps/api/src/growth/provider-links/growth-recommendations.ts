/**
 * Actionable, patient-safe recommendations for the Growth workspace. A CLOSED catalogue (ids only; the wording lives in the web strings, AR and EN):
 * availability, profile completeness, response time, cancellations, plus first-use nudges. Guardrails (tested): nothing here, in the API or in the web
 * wording, may encourage over-treatment, extra procedures, fee changes aimed at patients, or any review/testimonial tactic. Reviews are verified Kiorex reviews only.
 */
export const RECOMMENDATION_IDS = [
  "AVAILABILITY_MISSING",
  "AVAILABILITY_NO_BOOKABLE_TYPES",
  "PROFILE_INCOMPLETE",
  "RESPONSE_OVERDUE",
  "CANCELLATIONS_HIGH",
  "NO_SHOW_HIGH",
  "CREATE_FIRST_LINK",
  "PRINT_RECEPTION_QR",
  "ENABLE_WIDGET",
  "PAGE_NOT_READY",
] as const;
export type RecommendationId = (typeof RECOMMENDATION_IDS)[number];

export interface RecommendationInput {
  activeLinks: number;
  hasDeskLink: boolean;
  widgetEnabled: boolean;
  widgetEntitled: boolean;
  pageReady: boolean;
  liveDoctors: number;
  doctorsWithoutAvailability: number;
  bookableTypes: number;
  avgProfileCompleteness: number | null;
  kiorexBookings30d: number;
  cancelled30d: number;
  noShow30d: number;
  overdueConfirmations: number;
}

export interface Recommendation {
  id: RecommendationId;
  severity: "high" | "medium" | "low";
  /** Numbers the UI interpolates into its sentence. */
  params: Record<string, number>;
  /** Where the UI sends the user. */
  action: "availability" | "profile" | "bookings" | "links" | "widget" | "page" | "visit_types";
}

export const THRESHOLDS = { profileMin: 80, cancelRate: 0.2, noShowRate: 0.12, minBookingsForRates: 8 } as const;

export function buildRecommendations(i: RecommendationInput): Recommendation[] {
  const out: Recommendation[] = [];
  if (!i.pageReady) out.push({ id: "PAGE_NOT_READY", severity: "high", params: {}, action: "page" });
  if (i.bookableTypes === 0) out.push({ id: "AVAILABILITY_NO_BOOKABLE_TYPES", severity: "high", params: {}, action: "visit_types" });
  if (i.liveDoctors > 0 && i.doctorsWithoutAvailability > 0) out.push({ id: "AVAILABILITY_MISSING", severity: "high", params: { doctors: i.doctorsWithoutAvailability }, action: "availability" });
  if (i.avgProfileCompleteness != null && i.avgProfileCompleteness < THRESHOLDS.profileMin) out.push({ id: "PROFILE_INCOMPLETE", severity: "medium", params: { percent: Math.round(i.avgProfileCompleteness), target: THRESHOLDS.profileMin }, action: "profile" });
  if (i.overdueConfirmations > 0) out.push({ id: "RESPONSE_OVERDUE", severity: "high", params: { count: i.overdueConfirmations }, action: "bookings" });
  if (i.kiorexBookings30d >= THRESHOLDS.minBookingsForRates) {
    const c = i.cancelled30d / i.kiorexBookings30d;
    const n = i.noShow30d / i.kiorexBookings30d;
    if (c >= THRESHOLDS.cancelRate) out.push({ id: "CANCELLATIONS_HIGH", severity: "medium", params: { percent: Math.round(c * 100) }, action: "bookings" });
    if (n >= THRESHOLDS.noShowRate) out.push({ id: "NO_SHOW_HIGH", severity: "medium", params: { percent: Math.round(n * 100) }, action: "bookings" });
  }
  if (i.activeLinks === 0) out.push({ id: "CREATE_FIRST_LINK", severity: "medium", params: {}, action: "links" });
  else if (!i.hasDeskLink) out.push({ id: "PRINT_RECEPTION_QR", severity: "low", params: {}, action: "links" });
  if (i.widgetEntitled && !i.widgetEnabled) out.push({ id: "ENABLE_WIDGET", severity: "low", params: {}, action: "widget" });
  const rank = { high: 0, medium: 1, low: 2 } as const;
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}
