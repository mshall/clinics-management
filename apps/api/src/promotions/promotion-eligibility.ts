/**
 * GRW-P2-S eligibility and discount arithmetic (PURE). Eligibility is NON-CLINICAL only: the clinic's own doctors and visit types, the care type, new to this clinic, first Kiorex
 * booking, a time window and a minimum lead time. There is no attribute that can express a diagnosis, a drug, a test, a procedure or a health condition, and the discount applies to the VISIT
 * FEE component of the appointment type only (consultation, follow-up, video or home visit fee), never to a prescription, test or procedure.
 */
export const CARE_TYPES = ["IN_CLINIC", "VIDEO", "HOME_VISIT"] as const;
export type CareType = (typeof CARE_TYPES)[number];
export const careTypeOfServiceLocation = (loc: string | null | undefined): CareType => (loc === "VIDEO" ? "VIDEO" : loc === "HOME" ? "HOME_VISIT" : "IN_CLINIC");

export interface PromotionScope { doctorIds: string[]; appointmentTypeIds: string[]; careTypes: CareType[] }
export interface PromotionEligibility { newPatientsOnly: boolean; firstBookingOnly: boolean; minLeadHours: number; kiorexOnly: boolean }
export interface DiscountSpec { kind: "FIXED_MINOR" | "PERCENT_BP"; value: number; maxPerBookingMinor?: number | null }

/** The only keys a scope or an eligibility block may carry (anything else is refused, so no clinical or health attribute can be smuggled in). */
export const SCOPE_KEYS = ["doctorIds", "appointmentTypeIds", "careTypes"] as const;
export const ELIGIBILITY_KEYS = ["newPatientsOnly", "firstBookingOnly", "minLeadHours", "kiorexOnly"] as const;

export function parseScope(raw: unknown): { ok: true; scope: PromotionScope } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "SCOPE_INVALID" };
  const o = raw as Record<string, unknown>;
  for (const k of Object.keys(o)) if (!(SCOPE_KEYS as readonly string[]).includes(k)) return { ok: false, error: `SCOPE_KEY_NOT_ALLOWED:${k}` };
  const ids = (v: unknown) => (Array.isArray(v) && v.length <= 200 && v.every((x) => typeof x === "string" && x.length > 0 && x.length <= 64) ? [...new Set(v as string[])] : null);
  const doctorIds = ids(o.doctorIds ?? []); const appointmentTypeIds = ids(o.appointmentTypeIds ?? []);
  const careTypes = Array.isArray(o.careTypes) && o.careTypes.length > 0 && o.careTypes.every((c) => (CARE_TYPES as readonly unknown[]).includes(c)) ? ([...new Set(o.careTypes)] as CareType[]) : null;
  if (!doctorIds || !appointmentTypeIds || !careTypes) return { ok: false, error: "SCOPE_INVALID" };
  return { ok: true, scope: { doctorIds, appointmentTypeIds, careTypes } };
}

export function parseEligibility(raw: unknown): { ok: true; eligibility: PromotionEligibility } | { ok: false; error: string } {
  const o = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  if (!o) return { ok: false, error: "ELIGIBILITY_INVALID" };
  for (const k of Object.keys(o)) if (!(ELIGIBILITY_KEYS as readonly string[]).includes(k)) return { ok: false, error: `ELIGIBILITY_KEY_NOT_ALLOWED:${k}` };
  const bool = (v: unknown) => (typeof v === "boolean" ? v : v === undefined ? false : null);
  const newPatientsOnly = bool(o.newPatientsOnly), firstBookingOnly = bool(o.firstBookingOnly), kiorexOnly = o.kiorexOnly === undefined ? true : bool(o.kiorexOnly);
  const lead = o.minLeadHours === undefined ? 0 : o.minLeadHours;
  if (newPatientsOnly === null || firstBookingOnly === null || kiorexOnly === null || typeof lead !== "number" || !Number.isInteger(lead) || lead < 0 || lead > 720) return { ok: false, error: "ELIGIBILITY_INVALID" };
  return { ok: true, eligibility: { newPatientsOnly, firstBookingOnly, minLeadHours: lead, kiorexOnly } };
}

/** Discount for a visit fee. FIXED: value; PERCENT_BP: floor(fee * bp / 10000); both capped by maxPerBooking and by the fee itself (a discount never exceeds the visit fee). */
export function discountMinor(d: DiscountSpec, visitFeeMinor: number): number {
  if (!Number.isInteger(visitFeeMinor) || visitFeeMinor <= 0) return 0;
  let v = d.kind === "FIXED_MINOR" ? d.value : Math.floor((visitFeeMinor * d.value) / 10_000);
  if (d.maxPerBookingMinor != null) v = Math.min(v, d.maxPerBookingMinor);
  return Math.max(0, Math.min(v, visitFeeMinor));
}

export type Refusal = "PAUSED" | "NOT_ELIGIBLE" | "LIMIT_REACHED" | "BUDGET_EXHAUSTED" | "WALLET_INSUFFICIENT";
export interface VersionFacts { status: string; startsAt: Date; endsAt: Date; scope: PromotionScope; eligibility: PromotionEligibility; perPatientLimit: number; perDayLimit: number | null }

/** Status, window and care type: what the Clinic can check from the reserve request alone. */
export function checkReservable(v: VersionFacts, careType: string, now: Date): { ok: true } | { ok: false; reason: Refusal; detail: string } {
  if (v.status === "PAUSED") return { ok: false, reason: "PAUSED", detail: "PAUSED" };
  if (v.status === "EXHAUSTED") return { ok: false, reason: "BUDGET_EXHAUSTED", detail: "EXHAUSTED" };
  if (v.status !== "ACTIVE") return { ok: false, reason: "NOT_ELIGIBLE", detail: `STATUS_${v.status}` };
  if (now < v.startsAt || now >= v.endsAt) return { ok: false, reason: "NOT_ELIGIBLE", detail: "OUTSIDE_WINDOW" };
  if (!(v.scope.careTypes as readonly string[]).includes(careType)) return { ok: false, reason: "NOT_ELIGIBLE", detail: "CARE_TYPE_NOT_IN_SCOPE" };
  return { ok: true };
}

export function checkLimits(v: Pick<VersionFacts, "perPatientLimit" | "perDayLimit">, c: { patientUses: number; dayUses: number }): { ok: true } | { ok: false; reason: "LIMIT_REACHED"; detail: string } {
  if (c.patientUses >= v.perPatientLimit) return { ok: false, reason: "LIMIT_REACHED", detail: "PER_PATIENT" };
  if (v.perDayLimit != null && c.dayUses >= v.perDayLimit) return { ok: false, reason: "LIMIT_REACHED", detail: "PER_DAY" };
  return { ok: true };
}

export interface BookingFacts { doctorId: string; appointmentTypeId: string; careType: string; startsAt: Date; isNewToClinic: boolean; kiorexBookingsBefore: number; channelIsKiorex: boolean; visitFeeMinor: number }
/** Booking-time scope and eligibility (the appointment exists now, so doctor, type, lead time and newness can be checked). Empty doctor or type lists mean "all of this clinic". */
export function checkBooking(v: Pick<VersionFacts, "scope" | "eligibility">, b: BookingFacts, now: Date): { ok: true } | { ok: false; detail: string } {
  if (v.scope.doctorIds.length && !v.scope.doctorIds.includes(b.doctorId)) return { ok: false, detail: "DOCTOR_NOT_IN_SCOPE" };
  if (v.scope.appointmentTypeIds.length && !v.scope.appointmentTypeIds.includes(b.appointmentTypeId)) return { ok: false, detail: "TYPE_NOT_IN_SCOPE" };
  if (!(v.scope.careTypes as readonly string[]).includes(b.careType)) return { ok: false, detail: "CARE_TYPE_NOT_IN_SCOPE" };
  if (v.eligibility.kiorexOnly && !b.channelIsKiorex) return { ok: false, detail: "NOT_A_KIOREX_BOOKING" };
  if (v.eligibility.newPatientsOnly && !b.isNewToClinic) return { ok: false, detail: "NOT_NEW_TO_CLINIC" };
  if (v.eligibility.firstBookingOnly && b.kiorexBookingsBefore > 0) return { ok: false, detail: "NOT_FIRST_KIOREX_BOOKING" };
  if (b.startsAt.getTime() - now.getTime() < v.eligibility.minLeadHours * 3_600_000) return { ok: false, detail: "LEAD_TIME_TOO_SHORT" };
  if (b.visitFeeMinor <= 0) return { ok: false, detail: "NO_VISIT_FEE" };
  return { ok: true };
}
