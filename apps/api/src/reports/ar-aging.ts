/** RP-04 — AR aging bucket helpers (pure). */

export type AgingBucketKey = "b0_30" | "b31_60" | "b61_90" | "b90_plus";

export type AgingLineInput = {
  amountOpen: number;
  asOf: Date;
  issuedAt: Date;
};

export function agingBucket(asOf: Date, issuedAt: Date): AgingBucketKey {
  const days = Math.floor((asOf.getTime() - issuedAt.getTime()) / 86_400_000);
  if (days <= 30) return "b0_30";
  if (days <= 60) return "b31_60";
  if (days <= 90) return "b61_90";
  return "b90_plus";
}

export function bucketAgingLines(lines: AgingLineInput[], asOf = new Date()) {
  const buckets: Record<AgingBucketKey, number> = {
    b0_30: 0,
    b31_60: 0,
    b61_90: 0,
    b90_plus: 0,
  };
  let total = 0;
  for (const line of lines) {
    const amt = Number(line.amountOpen);
    if (!Number.isFinite(amt) || amt <= 0) continue;
    buckets[agingBucket(asOf, line.issuedAt)] += amt;
    total += amt;
  }
  return { buckets, total };
}
