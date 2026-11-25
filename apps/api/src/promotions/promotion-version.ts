import { createHash } from "node:crypto";
import { type DiscountSpec, parseEligibility, parseScope, type PromotionEligibility, type PromotionScope } from "./promotion-eligibility";
import { bothLanguages } from "./promotion-content-guard";
import type { SponsoredPromotionPolicy } from "./promotion-policy";

export interface VersionInput {
  nameAr: string; nameEn: string; patientCopyAr: string; patientCopyEn: string;
  scope: unknown; discount: { kind: "FIXED_MINOR" | "PERCENT_BP"; value: number; maxPerBookingMinor?: number | null };
  budgetCapMinor: number; perPatientLimit: number; perDayLimit?: number | null; eligibility: unknown;
  startsAt: Date; endsAt: Date; fundingMode: "WALLET_ONLY" | "WALLET_THEN_INVOICE";
}
export interface ValidVersion extends Omit<VersionInput, "scope" | "eligibility"> { scope: PromotionScope; eligibility: PromotionEligibility }

const MAX_DAYS = 365;
export function validateVersion(i: VersionInput, policy: SponsoredPromotionPolicy, now: Date): { ok: true; version: ValidVersion } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const t = { nameAr: i.nameAr?.trim() ?? "", nameEn: i.nameEn?.trim() ?? "", patientCopyAr: i.patientCopyAr?.trim() ?? "", patientCopyEn: i.patientCopyEn?.trim() ?? "" };
  if (!bothLanguages(t)) errors.push("TEXT_BOTH_LANGUAGES_REQUIRED");
  if (t.nameAr.length > 80 || t.nameEn.length > 80) errors.push("NAME_TOO_LONG");
  if (t.patientCopyAr.length > 300 || t.patientCopyEn.length > 300) errors.push("COPY_TOO_LONG");
  const sc = parseScope(i.scope); if (!sc.ok) errors.push(sc.error);
  const el = parseEligibility(i.eligibility); if (!el.ok) errors.push(el.error);
  const d = i.discount;
  if (!d || (d.kind !== "FIXED_MINOR" && d.kind !== "PERCENT_BP") || !Number.isInteger(d.value) || d.value < 1) errors.push("DISCOUNT_INVALID");
  else {
    if (d.kind === "PERCENT_BP" && d.value > 10_000) errors.push("DISCOUNT_PERCENT_OVER_100");
    if (d.maxPerBookingMinor != null && (!Number.isInteger(d.maxPerBookingMinor) || d.maxPerBookingMinor < 1)) errors.push("DISCOUNT_MAX_INVALID");
    if (d.kind === "PERCENT_BP" && d.maxPerBookingMinor == null) errors.push("PERCENT_NEEDS_MAX_PER_BOOKING"); // a percentage without a ceiling has an unbounded cost per booking
  }
  if (!Number.isInteger(i.budgetCapMinor) || i.budgetCapMinor < 1 || i.budgetCapMinor > 2_000_000_000) errors.push("BUDGET_INVALID");
  if (d && Number.isInteger(d.value) && d.kind === "FIXED_MINOR" && Number.isInteger(i.budgetCapMinor) && d.value > i.budgetCapMinor) errors.push("DISCOUNT_ABOVE_BUDGET");
  if (!Number.isInteger(i.perPatientLimit) || i.perPatientLimit < 1 || i.perPatientLimit > 20) errors.push("PER_PATIENT_LIMIT_INVALID");
  if (i.perDayLimit != null && (!Number.isInteger(i.perDayLimit) || i.perDayLimit < 1)) errors.push("PER_DAY_LIMIT_INVALID");
  if (!(i.startsAt instanceof Date) || !(i.endsAt instanceof Date) || Number.isNaN(i.startsAt.getTime()) || Number.isNaN(i.endsAt.getTime()) || i.endsAt <= i.startsAt) errors.push("WINDOW_INVALID");
  else {
    if (i.endsAt <= now) errors.push("WINDOW_IN_THE_PAST");
    if (i.endsAt.getTime() - i.startsAt.getTime() > MAX_DAYS * 86_400_000) errors.push("WINDOW_TOO_LONG");
  }
  if (i.fundingMode !== "WALLET_ONLY" && i.fundingMode !== "WALLET_THEN_INVOICE") errors.push("FUNDING_MODE_INVALID");
  if (sc.ok) for (const c of sc.scope.careTypes) if (!policy.allowedCareTypes.includes(c)) errors.push(`CARE_TYPE_NOT_ALLOWED:${c}`);
  if (errors.length || !sc.ok || !el.ok) return { ok: false, errors };
  return { ok: true, version: { ...i, ...t, scope: sc.scope, eligibility: el.eligibility, discount: { kind: d.kind, value: d.value, maxPerBookingMinor: d.maxPerBookingMinor ?? null }, perDayLimit: i.perDayLimit ?? null } };
}

const canon = (v: unknown): string => JSON.stringify(v, (_k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1))) : x));
/** Hash of everything a patient sees or money depends on. Same content, same hash (so a re-submit of the same text is recognisable); a different cap or copy is a different hash. */
export function contentHashOf(v: ValidVersion): string {
  return createHash("sha256").update(canon({ nameAr: v.nameAr, nameEn: v.nameEn, patientCopyAr: v.patientCopyAr, patientCopyEn: v.patientCopyEn, scope: { doctorIds: [...v.scope.doctorIds].sort(), appointmentTypeIds: [...v.scope.appointmentTypeIds].sort(), careTypes: [...v.scope.careTypes].sort() }, discount: v.discount, budgetCapMinor: v.budgetCapMinor, perPatientLimit: v.perPatientLimit, perDayLimit: v.perDayLimit, eligibility: v.eligibility, startsAt: v.startsAt.toISOString(), endsAt: v.endsAt.toISOString(), fundingMode: v.fundingMode })).digest("hex");
}

/** HIGH_VALUE (needs a second approver): budget at or above the threshold, a per-booking discount at or above it, or a percent above `maxDiscountBp`. */
export function highValueReasons(v: Pick<ValidVersion, "budgetCapMinor" | "discount">, policy: SponsoredPromotionPolicy): string[] {
  const r: string[] = [];
  if (v.budgetCapMinor >= policy.highValueBudgetMinor) r.push("BUDGET_AT_OR_ABOVE_THRESHOLD");
  const perBooking = v.discount.kind === "FIXED_MINOR" ? Math.min(v.discount.value, v.discount.maxPerBookingMinor ?? Infinity) : (v.discount.maxPerBookingMinor ?? Infinity);
  if (perBooking >= policy.highValuePerBookingMinor) r.push("PER_BOOKING_AT_OR_ABOVE_THRESHOLD");
  if (v.discount.kind === "PERCENT_BP" && v.discount.value > policy.maxDiscountBp) r.push("PERCENT_ABOVE_MAXIMUM");
  return r;
}

/** Review kinds a version needs: CONTENT always (advertising), SCOPE always (visit-fee-only, clinic's own doctors), HIGH_VALUE when the thresholds say so. */
export function reviewKindsFor(v: Pick<ValidVersion, "budgetCapMinor" | "discount">, policy: SponsoredPromotionPolicy): Array<"CONTENT" | "SCOPE" | "HIGH_VALUE"> {
  return highValueReasons(v, policy).length ? ["CONTENT", "SCOPE", "HIGH_VALUE"] : ["CONTENT", "SCOPE"];
}

export type ReviewRow = { kind: string; requestedBy: string; decidedBy: string | null; decision: string | null };
/** Aggregates the review rows of a version: APPROVED only when every required kind is approved, nobody approved their own work, and the HIGH_VALUE approver differs from the CONTENT/SCOPE approver. */
export function reviewOutcome(required: readonly string[], rows: readonly ReviewRow[]): "APPROVED" | "REJECTED" | "NEEDS_CHANGES" | "PENDING" | "INVALID" {
  const by = new Map(rows.map((r) => [r.kind, r]));
  if (rows.some((r) => r.decision === "REJECTED")) return "REJECTED";
  if (rows.some((r) => r.decision === "NEEDS_CHANGES")) return "NEEDS_CHANGES";
  if (required.some((k) => !by.get(k)?.decision)) return "PENDING";
  if (rows.some((r) => r.decidedBy && r.decidedBy === r.requestedBy)) return "INVALID";
  const hv = by.get("HIGH_VALUE");
  if (hv) { const others = rows.filter((r) => r.kind !== "HIGH_VALUE" && r.decidedBy).map((r) => r.decidedBy); if (others.includes(hv.decidedBy)) return "INVALID"; }
  return "APPROVED";
}

export const discountSpecOf = (v: Pick<ValidVersion, "discount">): DiscountSpec => v.discount;
