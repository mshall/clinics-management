/**
 * COM-2 provider-side rate view (pure). Kiorex sets the commission rate (default per organisation type, override per organisation, maker-checker); this product only displays it.
 * The history rows arrive with their start time, so the effective rate is computed here at read time: a change that was future-dated takes effect by itself, and an old instant keeps the old rate.
 * Nothing here is a rate of its own: with no active row the answer is NOT_SET (no commission is charged, "rate not set").
 */
/**
 * COM-3 (all optional, tolerant: an absent or malformed value reads as null = "Kiorex sets nothing here", the product's own default applies): currency, rounding of a percent charge, minimum to collect,
 * the collection timeline (grace, dunning retries, invoice due, reminders relative to the due date, negative = before), the dispute window and whether a saved-method charge is permitted.
 */
export type RateSpecView = {
  feeType: "PERCENT" | "FLAT"; percentBps: number | null; flatMinor: number | null; minMinor: number | null; maxMinor: number | null; mode: string | null;
  currency?: string | null; rounding?: "HALF_UP" | "DOWN" | "UP" | null; minCollectMinor?: number | null; graceDays?: number | null; retryDays?: number[] | null; invoiceDueDays?: number | null;
  reminderDays?: number[] | null; disputeWindowDays?: number | null; savedMethodChargeAllowed?: boolean | null;
  /** LG-COM-20 (additive, optional): treatment per tender kind; a field or a kind left out inherits the base values above. */
  tenders?: Partial<Record<"ONLINE" | "CASH" | "CASH_TRANSFER", TenderTreatmentView>>;
};
export type TenderTreatmentView = { feeType?: "PERCENT" | "FLAT"; percentBps?: number | null; flatMinor?: number | null; minMinor?: number | null; maxMinor?: number | null; mode?: string | null; graceDays?: number | null };
export type RateHistoryRow = { version: number; scope: "DEFAULT" | "ORG"; kind: "RATE" | "INHERIT"; effectiveFrom: string; reason: string | null; spec: RateSpecView | null };
export type EffectiveRateView = { state: "SET" | "NOT_SET"; source: "OVERRIDE" | "DEFAULT" | null; version: number | null; effectiveFrom: string | null; reason: string | null; spec: RateSpecView | null };
export const NOT_SET_VIEW: EffectiveRateView = { state: "NOT_SET", source: null, version: null, effectiveFrom: null, reason: null, spec: null };

const inForce = (rows: RateHistoryRow[], at: Date): RateHistoryRow | null => {
  const live = rows.filter((r) => new Date(r.effectiveFrom).getTime() <= at.getTime());
  live.sort((a, b) => new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime() || b.version - a.version);
  return live[0] ?? null;
};

export function effectiveRateAt(history: RateHistoryRow[], at: Date): EffectiveRateView {
  const o = inForce(history.filter((r) => r.scope === "ORG"), at);
  if (o && o.kind === "RATE" && o.spec) return { state: "SET", source: "OVERRIDE", version: o.version, effectiveFrom: o.effectiveFrom, reason: o.reason, spec: o.spec };
  const d = inForce(history.filter((r) => r.scope === "DEFAULT"), at);
  if (d && d.kind === "RATE" && d.spec) return { state: "SET", source: "DEFAULT", version: d.version, effectiveFrom: d.effectiveFrom, reason: null, spec: d.spec };
  return NOT_SET_VIEW;
}

/** Validation of what Kiorex pushes: a malformed view is refused whole rather than shown half. */
export function rateViewProblems(b: unknown): string[] {
  if (!b || typeof b !== "object") return ["body must be an object"];
  const o = b as Record<string, unknown>;
  const out: string[] = [];
  if (typeof o.orgRef !== "string" || !o.orgRef) out.push("orgRef is required");
  if (!["CLINIC", "PHARMACY", "LAB"].includes(String(o.product))) out.push("product must be CLINIC, PHARMACY or LAB");
  if (typeof o.version !== "string" || !/^\d{1,18}$/.test(o.version)) out.push("version must be a numeric string");
  if (!Array.isArray(o.history)) out.push("history must be an array");
  else for (const [i, r] of (o.history as unknown[]).entries()) {
    const h = r as Record<string, unknown>;
    if (!h || typeof h.version !== "number" || !["DEFAULT", "ORG"].includes(String(h.scope)) || !["RATE", "INHERIT"].includes(String(h.kind)) || Number.isNaN(Date.parse(String(h.effectiveFrom)))) out.push(`history[${i}] is malformed`);
    else if (h.kind === "RATE") {
      const s = h.spec as Record<string, unknown> | null;
      if (!s || !["PERCENT", "FLAT"].includes(String(s.feeType))) out.push(`history[${i}].spec is malformed`);
    }
  }
  return out;
}

/** Commission of one charge in minor units under an effective rate: percent of the fee basis (rounded per `rounding`, half up when unset: what always shipped) or the flat amount, then the floor and the cap. Same arithmetic as the Kiorex side and the contract vectors. */
export function commissionAmountMinor(basisMinor: number, spec: RateSpecView): number {
  const exact = basisMinor * (spec.percentBps ?? 0);
  const pct = spec.rounding === "DOWN" ? Math.floor(exact / 10_000) : spec.rounding === "UP" ? Math.ceil(exact / 10_000) : Math.floor((exact * 2 + 10_000) / 20_000);
  let v = spec.feeType === "FLAT" ? (spec.flatMinor ?? 0) : pct;
  if (spec.minMinor != null) v = Math.max(v, spec.minMinor);
  if (spec.maxMinor != null) v = Math.min(v, spec.maxMinor);
  return v;
}

/**
 * LG-COM-20: the spec that prices one tender kind (same rule as the Kiorex side): the entry replaces only what it sets, everything else inherits the base; no kind or no entry is the base itself.
 * Tolerant: a malformed entry is ignored (the base applies), it never throws. `treatment` says which one priced the charge.
 */
export function specForTender(spec: RateSpecView, kind: "ONLINE" | "CASH" | "CASH_TRANSFER" | null): { spec: RateSpecView; treatment: "BASE" | "TENDER" } {
  const { tenders, ...base } = spec;
  const t = kind && tenders && typeof tenders === "object" ? (tenders[kind] as TenderTreatmentView | undefined) : undefined;
  if (!t || typeof t !== "object" || Array.isArray(t)) return { spec: base, treatment: "BASE" };
  const n = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : null);
  const r: RateSpecView = { ...base };
  let used = false;
  if (t.feeType === "PERCENT") { r.feeType = "PERCENT"; r.percentBps = n(t.percentBps) ?? 0; r.flatMinor = null; used = true; }
  else if (t.feeType === "FLAT") { r.feeType = "FLAT"; r.flatMinor = n(t.flatMinor) ?? 0; r.percentBps = null; used = true; }
  if ("minMinor" in t && (t.minMinor === null || n(t.minMinor) !== null)) { r.minMinor = n(t.minMinor); used = true; }
  if ("maxMinor" in t && (t.maxMinor === null || n(t.maxMinor) !== null)) { r.maxMinor = n(t.maxMinor); used = true; }
  if ("mode" in t && (t.mode === null || typeof t.mode === "string")) { r.mode = t.mode ?? null; used = true; }
  if ("graceDays" in t && (t.graceDays === null || n(t.graceDays) !== null)) { r.graceDays = n(t.graceDays); used = true; }
  return used ? { spec: r, treatment: "TENDER" } : { spec: base, treatment: "BASE" };
}

const wholeDays = (v: unknown, min: number, max: number): number | null => (typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? v : null);
const dayList = (v: unknown, min: number, max: number, maxLen: number): number[] | null => (Array.isArray(v) && v.length > 0 && v.length <= maxLen && v.every((n, i, a) => wholeDays(n, min, max) !== null && (i === 0 || n > (a[i - 1] as number))) ? [...(v as number[])] : null);

/** The configurable collection parameters of the rate in force; every one is null when Kiorex does not set it (then the Clinic default applies). Never throws on a malformed value. */
export type RateParams = { graceDays: number | null; retryDays: number[] | null; invoiceDueDays: number | null; reminderDays: number[] | null; disputeWindowDays: number | null; savedMethodChargeAllowed: boolean | null };
export const NO_RATE_PARAMS: RateParams = { graceDays: null, retryDays: null, invoiceDueDays: null, reminderDays: null, disputeWindowDays: null, savedMethodChargeAllowed: null };
export function rateParamsOf(spec: RateSpecView | null | undefined): RateParams {
  if (!spec || typeof spec !== "object") return NO_RATE_PARAMS;
  return {
    graceDays: wholeDays(spec.graceDays, 0, 30), retryDays: dayList(spec.retryDays, 1, 60, 6), invoiceDueDays: wholeDays(spec.invoiceDueDays, 1, 90),
    reminderDays: dayList(spec.reminderDays, -30, 90, 8), disputeWindowDays: wholeDays(spec.disputeWindowDays, 0, 365), savedMethodChargeAllowed: typeof spec.savedMethodChargeAllowed === "boolean" ? spec.savedMethodChargeAllowed : null,
  };
}

/** COM-3 disclosure / counsel as pushed with the view (additive, optional). Only the counsel STATUS is kept: never the reviewer, the document or the conditions. Wording that is not set is a hidden block. */
export type DisclosureView = { rateDisclosure: { en: string; ar: string }; termsSummary: { en: string; ar: string }; showOverrideReason: boolean; wordingSet: boolean };
export type CounselStatusView = "NOT_REVIEWED" | "APPROVED_WITH_CONDITIONS" | "APPROVED" | "REJECTED";
const COUNSEL_STATUSES: readonly string[] = ["NOT_REVIEWED", "APPROVED_WITH_CONDITIONS", "APPROVED", "REJECTED"];
const text = (v: unknown): string => (typeof v === "string" ? v.slice(0, 4000) : "");
const bi = (v: unknown): { en: string; ar: string } => { const o = v && typeof v === "object" ? (v as Record<string, unknown>) : {}; return { en: text(o.en), ar: text(o.ar) }; };
export function parseDisclosure(raw: unknown): DisclosureView | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const rateDisclosure = bi(o.rateDisclosure); const termsSummary = bi(o.termsSummary);
  const wordingSet = [rateDisclosure.en, rateDisclosure.ar, termsSummary.en, termsSummary.ar].some((x) => x.trim().length > 0);
  return { rateDisclosure, termsSummary, showOverrideReason: o.showOverrideReason === true, wordingSet };
}
export function parseCounselStatus(raw: unknown): { status: CounselStatusView; reviewedOn: string | null } | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.status !== "string" || !COUNSEL_STATUSES.includes(o.status)) return null;
  return { status: o.status as CounselStatusView, reviewedOn: typeof o.reviewedOn === "string" && !Number.isNaN(Date.parse(o.reviewedOn)) ? o.reviewedOn.slice(0, 10) : null };
}
