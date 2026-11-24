/** GRW-P2-S: pure helpers of the sponsored-promotion screens (no React). The server is the authority for every amount, status and review; this only shapes what it returns and builds the request body. */
export type PromotionStatusKey = "DRAFT" | "SUBMITTED" | "IN_REVIEW" | "APPROVED" | "ACTIVE" | "PAUSED" | "EXHAUSTED" | "EXPIRED" | "REJECTED" | "ARCHIVED";
export type CareTypeKey = "IN_CLINIC" | "VIDEO" | "HOME_VISIT";
export const CARE_TYPES: readonly CareTypeKey[] = ["IN_CLINIC", "VIDEO", "HOME_VISIT"];

export interface PromotionView {
  id: string; status: PromotionStatusKey; pauseReason: string | null;
  version: { version: number; nameAr: string; nameEn: string; patientCopyAr: string; patientCopyEn: string; scope: { doctorIds: string[]; appointmentTypeIds: string[]; careTypes: CareTypeKey[] }; discountKind: "FIXED_MINOR" | "PERCENT_BP"; discountValue: number; maxPerBookingMinor: number | null; budgetCapMinor: number; perPatientLimit: number; perDayLimit: number | null; startsAt: string; endsAt: string; fundingMode: "WALLET_ONLY" | "WALLET_THEN_INVOICE" };
  budget: { capMinor: number; reservedMinor: number; debitedMinor: number; remainingMinor: number; exposureMinor: number };
  reservations: Record<string, number>; reviews: Array<{ kind: string; decision: string | null; reason: string | null }>;
}
export interface LedgerRow { id: string; type: "RESERVE" | "RELEASE" | "DEBIT" | "REVERSE_DEBIT"; amountMinor: number; currency: string; reason: string; bookingRef: string | null; createdAt: string }

export const minorToUnits = (minor: number) => minor / 100;
export const unitsToMinor = (units: number) => Math.round(units * 100);
/** Share of the budget that is held or spent, 0 to 100 (rounded), for the progress bar. */
export const budgetUsedPct = (b: { capMinor: number; exposureMinor: number }) => (b.capMinor > 0 ? Math.min(100, Math.max(0, Math.round((b.exposureMinor / b.capMinor) * 100))) : 0);

export type Tone = "neutral" | "good" | "warn" | "bad" | "info" | "brand";
export const statusTone = (s: PromotionStatusKey): Tone => (s === "ACTIVE" ? "good" : s === "IN_REVIEW" || s === "SUBMITTED" || s === "APPROVED" ? "info" : s === "PAUSED" || s === "EXHAUSTED" ? "warn" : s === "REJECTED" ? "bad" : "neutral");
/** What the owner can do in each state (the server enforces the same table). */
export const canSubmit = (s: PromotionStatusKey) => s === "DRAFT" || s === "REJECTED";
export const canPause = (s: PromotionStatusKey) => s === "ACTIVE" || s === "EXHAUSTED";
export const canResume = (s: PromotionStatusKey) => s === "PAUSED";
export const canEdit = (s: PromotionStatusKey) => ["DRAFT", "REJECTED", "APPROVED", "ACTIVE", "PAUSED", "EXHAUSTED"].includes(s);
export const canArchive = (s: PromotionStatusKey) => ["DRAFT", "REJECTED", "EXPIRED", "EXHAUSTED", "PAUSED", "APPROVED"].includes(s);

export interface PromotionForm {
  nameAr: string; nameEn: string; patientCopyAr: string; patientCopyEn: string; careTypes: CareTypeKey[];
  discountKind: "FIXED_MINOR" | "PERCENT_BP"; discountValue: string; maxPerBooking: string; budget: string; perPatientLimit: string; perDayLimit: string;
  newPatientsOnly: boolean; firstBookingOnly: boolean; minLeadHours: string; startsAt: string; endsAt: string; fundingMode: "WALLET_ONLY" | "WALLET_THEN_INVOICE";
}
export const emptyForm = (): PromotionForm => ({ nameAr: "", nameEn: "", patientCopyAr: "", patientCopyEn: "", careTypes: ["IN_CLINIC"], discountKind: "FIXED_MINOR", discountValue: "", maxPerBooking: "", budget: "", perPatientLimit: "1", perDayLimit: "", newPatientsOnly: false, firstBookingOnly: false, minLeadHours: "0", startsAt: "", endsAt: "", fundingMode: "WALLET_ONLY" });

export type FormError = "names" | "copy" | "careType" | "discount" | "percentMax" | "budget" | "budgetBelowDiscount" | "window" | "limit";
/** Client-side mirror of the server rules, so the owner sees the problem before sending. The server still decides. */
export function validateForm(f: PromotionForm): FormError[] {
  const e: FormError[] = []; const num = (s: string) => (s.trim() === "" ? NaN : Number(s));
  if (!f.nameAr.trim() || !f.nameEn.trim()) e.push("names");
  if (!f.patientCopyAr.trim() || !f.patientCopyEn.trim()) e.push("copy");
  if (!f.careTypes.length) e.push("careType");
  const v = num(f.discountValue); const budget = num(f.budget);
  if (!(v > 0) || (f.discountKind === "PERCENT_BP" && v > 100)) e.push("discount");
  if (f.discountKind === "PERCENT_BP" && !(num(f.maxPerBooking) > 0)) e.push("percentMax");
  if (!(budget > 0)) e.push("budget");
  else if (f.discountKind === "FIXED_MINOR" && v > budget) e.push("budgetBelowDiscount");
  const s = Date.parse(f.startsAt), en = Date.parse(f.endsAt);
  if (Number.isNaN(s) || Number.isNaN(en) || en <= s) e.push("window");
  const pp = num(f.perPatientLimit); if (!(Number.isInteger(pp) && pp >= 1 && pp <= 20) || (f.perDayLimit.trim() !== "" && !(Number.isInteger(num(f.perDayLimit)) && num(f.perDayLimit) >= 1))) e.push("limit");
  return e;
}

/** Request body of create and new-version. Money in minor units; a percent is sent in basis points. */
export function buildBody(f: PromotionForm) {
  const value = Number(f.discountValue);
  return {
    nameAr: f.nameAr.trim(), nameEn: f.nameEn.trim(), patientCopyAr: f.patientCopyAr.trim(), patientCopyEn: f.patientCopyEn.trim(),
    scope: { doctorIds: [], appointmentTypeIds: [], careTypes: f.careTypes },
    discount: { kind: f.discountKind, value: f.discountKind === "FIXED_MINOR" ? unitsToMinor(value) : Math.round(value * 100), ...(f.maxPerBooking.trim() ? { maxPerBookingMinor: unitsToMinor(Number(f.maxPerBooking)) } : {}) },
    budgetCapMinor: unitsToMinor(Number(f.budget)), perPatientLimit: Number(f.perPatientLimit), ...(f.perDayLimit.trim() ? { perDayLimit: Number(f.perDayLimit) } : {}),
    eligibility: { newPatientsOnly: f.newPatientsOnly, firstBookingOnly: f.firstBookingOnly, minLeadHours: Number(f.minLeadHours) || 0, kiorexOnly: true },
    startsAt: new Date(f.startsAt).toISOString(), endsAt: new Date(f.endsAt).toISOString(), fundingMode: f.fundingMode,
  };
}

/** The 422 `PROMOTION_CONTENT_REJECTED` hits, as the terms to show the owner (deduplicated). */
export const guardTerms = (body: unknown): string[] => { const h = (body as { hits?: Array<{ term?: string; severity?: string }> } | null)?.hits ?? []; return [...new Set(h.filter((x) => x.severity !== "WARN" && x.term).map((x) => x.term!))]; };
