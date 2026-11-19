/** RP-03 — Kiorex impact figures (pure helpers). */

export type KiorexImpactInput = {
  bookings: number;
  attended: number;
  newPatients: number;
  visitRevenue: number;
  commission: number;
  offset: number;
};

export type KiorexImpactDerived = {
  netCommissionCost: number;
  netCostPerNewPatient: number | null;
  revenuePerNewPatient: number | null;
};

export function deriveKiorexImpact(input: KiorexImpactInput): KiorexImpactDerived {
  const netCommissionCost = round2(Math.max(0, input.commission - input.offset));
  const netCostPerNewPatient =
    input.newPatients > 0 ? round2(netCommissionCost / input.newPatients) : null;
  const revenuePerNewPatient =
    input.newPatients > 0 ? round2(input.visitRevenue / input.newPatients) : null;
  return { netCommissionCost, netCostPerNewPatient, revenuePerNewPatient };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Statement match: commission confirmed and offset must equal CR-11 summary fields. */
export function matchesStatement(impact: { commission: number; offset: number }, statement: { commission: number; offset: number }): boolean {
  return round2(impact.commission) === round2(statement.commission) && round2(impact.offset) === round2(statement.offset);
}
