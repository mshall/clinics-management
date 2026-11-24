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
  // GRW-P2-C: the closed catalogue grows (deterministic triggers, each shows its data window, none promises an uplift)
  "PROFILE_PHOTO_MISSING",
  "PROFILE_BIO_INCOMPLETE",
  "PUBLISH_MORE_SLOTS",
  "RESPOND_TO_REVIEW",
  "ADD_LANGUAGE",
  "VERIFICATION_PENDING",
  "LINK_CONVERSION_LOW",
  "LINK_PAUSED_IDLE",
  "SOCIAL_TEMPLATE_UNUSED",
  "STATEMENT_DISPUTE_CLOSING",
  "PLAN_LIMIT_NEAR",
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
  /** GRW-P2-C additions; every one is optional so older callers and tests keep their meaning (absent = rule silent). */
  doctorsWithoutPhoto?: number;
  doctorsWithIncompleteBio?: number;
  doctorsWithFewSlots?: number;
  unrepliedReviews30d?: number;
  doctorsSingleLanguage?: number;
  verificationRequestsPending?: number;
  linkVisits30d?: number;
  linkBookings30d?: number;
  pausedIdleLinks?: number;
  socialSharedLast30d?: number;
  disputesClosingSoon?: number;
  linksUsed?: number;
  maxActiveLinks?: number;
}

export interface Recommendation {
  id: RecommendationId;
  severity: "high" | "medium" | "low";
  /** Numbers the UI interpolates into its sentence. */
  params: Record<string, number>;
  /** Where the UI sends the user. */
  action: "availability" | "profile" | "bookings" | "links" | "widget" | "page" | "visit_types" | "reviews" | "verification" | "share" | "statements";
  /** The data window the rule looked at, e.g. "30d" or "now": shown next to the card so nothing reads as a forecast. */
  window?: string;
}

/** Documented thresholds of the GRW-P2-C rules (the single place; tests pin them). */
export const THRESHOLDS_V2 = { fewSlotsPerWeek: 10, linkMinVisits: 30, linkMinConversion: 0.03, pausedIdleDays: 30, disputeClosingDays: 3, planLimitShare: 0.8 } as const;

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
  const n = (v: number | undefined) => v ?? 0;
  if (n(i.doctorsWithoutPhoto) > 0) out.push({ id: "PROFILE_PHOTO_MISSING", severity: "medium", params: { doctors: n(i.doctorsWithoutPhoto) }, action: "profile", window: "now" });
  if (n(i.doctorsWithIncompleteBio) > 0) out.push({ id: "PROFILE_BIO_INCOMPLETE", severity: "medium", params: { doctors: n(i.doctorsWithIncompleteBio) }, action: "profile", window: "now" });
  if (i.liveDoctors > 0 && n(i.doctorsWithFewSlots) > 0) out.push({ id: "PUBLISH_MORE_SLOTS", severity: "medium", params: { doctors: n(i.doctorsWithFewSlots), perWeek: THRESHOLDS_V2.fewSlotsPerWeek }, action: "availability", window: "next 7 days" });
  if (n(i.unrepliedReviews30d) > 0) out.push({ id: "RESPOND_TO_REVIEW", severity: "medium", params: { count: n(i.unrepliedReviews30d) }, action: "reviews", window: "30d" });
  if (n(i.doctorsSingleLanguage) > 0) out.push({ id: "ADD_LANGUAGE", severity: "low", params: { doctors: n(i.doctorsSingleLanguage) }, action: "profile", window: "now" });
  if (n(i.verificationRequestsPending) > 0) out.push({ id: "VERIFICATION_PENDING", severity: "low", params: { count: n(i.verificationRequestsPending) }, action: "verification", window: "now" });
  if (n(i.linkVisits30d) >= THRESHOLDS_V2.linkMinVisits && n(i.linkBookings30d) / n(i.linkVisits30d) < THRESHOLDS_V2.linkMinConversion) {
    out.push({ id: "LINK_CONVERSION_LOW", severity: "medium", params: { visits: n(i.linkVisits30d), bookings: n(i.linkBookings30d), percent: Math.round((n(i.linkBookings30d) / n(i.linkVisits30d)) * 100) }, action: "profile", window: "30d" });
  }
  if (n(i.pausedIdleLinks) > 0) out.push({ id: "LINK_PAUSED_IDLE", severity: "low", params: { count: n(i.pausedIdleLinks), days: THRESHOLDS_V2.pausedIdleDays }, action: "links", window: `${THRESHOLDS_V2.pausedIdleDays}d` });
  if (i.activeLinks > 0 && i.socialSharedLast30d !== undefined && i.socialSharedLast30d === 0) out.push({ id: "SOCIAL_TEMPLATE_UNUSED", severity: "low", params: {}, action: "share", window: "30d" });
  if (n(i.disputesClosingSoon) > 0) out.push({ id: "STATEMENT_DISPUTE_CLOSING", severity: "high", params: { count: n(i.disputesClosingSoon), days: THRESHOLDS_V2.disputeClosingDays }, action: "statements", window: `${THRESHOLDS_V2.disputeClosingDays}d` });
  if (i.maxActiveLinks && i.maxActiveLinks > 0 && n(i.linksUsed) >= Math.ceil(i.maxActiveLinks * THRESHOLDS_V2.planLimitShare)) {
    out.push({ id: "PLAN_LIMIT_NEAR", severity: "low", params: { used: n(i.linksUsed), limit: i.maxActiveLinks }, action: "links", window: "now" });
  }
  const rank = { high: 0, medium: 1, low: 2 } as const;
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}
