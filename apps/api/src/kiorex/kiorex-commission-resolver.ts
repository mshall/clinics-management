import { ClinicalSpecialty, FeeType, type KiorexCommissionRate, type Profession, type ServiceLocation } from "@prisma/client";

export type RateRow = Pick<
  KiorexCommissionRate,
  | "id"
  | "marketId"
  | "specialty"
  | "feeType"
  | "amount"
  | "percent"
  | "minAmount"
  | "maxAmount"
  | "benchmarkFlat"
  | "benchmarkPercent"
  | "benchmarkSource"
  | "benchmarkCheckedAt"
  | "validFrom"
  | "validTo"
> & {
  /** Rev 2.3 narrowing columns (optional: legacy rows and tests omit them => they apply to every profession / location). */
  profession?: Profession | null;
  serviceLocation?: ServiceLocation | null;
};

/** Booking context for per-profession / per-serviceLocation commission (KX-05 §08, ADR-029/030; Q13 home-visit override is NEEDS_HUMAN: no rate is seeded). */
export type RateContext = { profession?: Profession | null; serviceLocation?: ServiceLocation | null };

export function isRateActive(row: RateRow, at: Date): boolean {
  if (row.validFrom > at) return false;
  if (row.validTo && row.validTo <= at) return false;
  return true;
}

/** Specialty override wins over market default (specialty null). Expired rows ignored. */
export function resolveKiorexCommissionRate(
  rows: RateRow[],
  specialty: ClinicalSpecialty | null | undefined,
  at: Date = new Date(),
  ctx: RateContext = {},
): RateRow | null {
  // A row narrowed to a profession and/or location applies only when the booking matches it.
  const active = rows
    .filter((r) => isRateActive(r, at))
    .filter((r) => (r.profession == null || r.profession === ctx.profession) && (r.serviceLocation == null || r.serviceLocation === ctx.serviceLocation));
  if (!active.length) return null;

  // Most specific wins: profession+location > profession > location, each newest first; then the specialty / market-default rules below.
  const narrowed = active
    .filter((r) => r.profession != null || r.serviceLocation != null)
    .sort((a, b) => Number(b.profession != null) + Number(b.serviceLocation != null) - (Number(a.profession != null) + Number(a.serviceLocation != null)) || b.validFrom.getTime() - a.validFrom.getTime());
  if (narrowed[0]) return narrowed[0];
  const unnarrowed = active.filter((r) => r.profession == null && r.serviceLocation == null);
  if (!unnarrowed.length) return null;
  return resolveBySpecialty(unnarrowed, specialty);
}

function resolveBySpecialty(active: RateRow[], specialty: ClinicalSpecialty | null | undefined): RateRow | null {
  if (specialty) {
    const specialtyRows = active
      .filter((r) => r.specialty === specialty)
      .sort((a, b) => b.validFrom.getTime() - a.validFrom.getTime());
    if (specialtyRows[0]) return specialtyRows[0];
  }

  const marketDefault = active
    .filter((r) => r.specialty == null)
    .sort((a, b) => b.validFrom.getTime() - a.validFrom.getTime());
  return marketDefault[0] ?? null;
}

export function applyPercentCommission(
  visitFee: number,
  percent: number,
  minAmount: number | null | undefined,
  maxAmount: number | null | undefined,
): number {
  let fee = (visitFee * percent) / 100;
  if (minAmount != null) fee = Math.max(fee, Number(minAmount));
  if (maxAmount != null) fee = Math.min(fee, Number(maxAmount));
  return Math.round(fee * 100) / 100;
}

export function effectiveFlatFee(rate: RateRow, visitFeeForPercent = 500): number | null {
  if (rate.feeType === FeeType.FLAT) {
    return rate.amount != null ? Number(rate.amount) : null;
  }
  if (rate.percent == null) return null;
  return applyPercentCommission(
    visitFeeForPercent,
    Number(rate.percent),
    rate.minAmount != null ? Number(rate.minAmount) : null,
    rate.maxAmount != null ? Number(rate.maxAmount) : null,
  );
}

export function isAboveBenchmarkTarget(
  rate: RateRow,
  targetRatio: number,
): boolean {
  if (rate.feeType === FeeType.FLAT) {
    if (rate.benchmarkFlat == null || rate.amount == null) return false;
    return Number(rate.amount) > targetRatio * Number(rate.benchmarkFlat);
  }
  if (rate.benchmarkPercent == null || rate.percent == null) return false;
  return Number(rate.percent) > targetRatio * Number(rate.benchmarkPercent);
}