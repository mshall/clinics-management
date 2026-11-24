import type { CommissionChargeStatus } from "@prisma/client";

/**
 * Provider statement reconciliation (GRW-P1-D2). Pure: decisions explain, charges bill, and the two must agree for every appointment of the period.
 * Money is handled in integer minor units (piastres) so the totals are exact.
 */
export interface StatementDecision {
  appointmentId: string;
  policyVersion: string;
  decision: "CHARGE" | "NO_CHARGE" | "WAIVED";
  origin: string;
  reasonCodes: string[];
  amount: string | null;
  createdAt: Date;
}
export interface StatementCharge {
  appointmentId: string;
  amount: string;
  status: CommissionChargeStatus;
  reversalReason: string | null;
}

export type MismatchKind = "NO_CHARGE_ROW_FOR_CHARGE_DECISION" | "ACTIVE_CHARGE_FOR_NO_CHARGE_DECISION" | "AMOUNT_MISMATCH" | "ACTIVE_CHARGE_WITHOUT_DECISION";
export interface Mismatch { appointmentId: string; kind: MismatchKind; expected: string; actual: string }

const ACTIVE = new Set<CommissionChargeStatus>(["PENDING", "CONFIRMED", "BILLED", "DISPUTED"]);
export const toMinor = (v: string | null | undefined): number => (v ? Math.round(Number(v) * 100) : 0);
export const fromMinor = (n: number): string => (n / 100).toFixed(2);

export function latestDecisionPerAppointment(rows: StatementDecision[]): Map<string, StatementDecision> {
  const out = new Map<string, StatementDecision>();
  for (const r of [...rows].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || (a.policyVersion < b.policyVersion ? -1 : 1))) out.set(r.appointmentId, r);
  return out;
}

export function reconcileStatement(decisions: StatementDecision[], charges: StatementCharge[]) {
  const latest = latestDecisionPerAppointment(decisions);
  const chargeBy = new Map(charges.map((c) => [c.appointmentId, c]));
  const ids = new Set<string>([...latest.keys(), ...chargeBy.keys()]);
  let expected = 0;
  let billedActive = 0;
  let reversed = 0;
  const mismatches: Mismatch[] = [];
  const byDecision: Record<string, number> = { CHARGE: 0, NO_CHARGE: 0, WAIVED: 0 };
  const noChargeReasons: Record<string, number> = {};
  const byOrigin: Record<string, number> = {};

  for (const id of [...ids].sort()) {
    const d = latest.get(id);
    const c = chargeBy.get(id);
    if (d) {
      byDecision[d.decision] = (byDecision[d.decision] ?? 0) + 1;
      byOrigin[d.origin] = (byOrigin[d.origin] ?? 0) + 1;
      if (d.decision !== "CHARGE") for (const r of d.reasonCodes) noChargeReasons[r] = (noChargeReasons[r] ?? 0) + 1;
    }
    const exp = d?.decision === "CHARGE" ? toMinor(d.amount) : 0;
    const act = c && ACTIVE.has(c.status) ? toMinor(c.amount) : 0;
    const rev = c && !ACTIVE.has(c.status) ? toMinor(c.amount) : 0;
    expected += exp;
    billedActive += act;
    reversed += rev;
    if (!d && act > 0) mismatches.push({ appointmentId: id, kind: "ACTIVE_CHARGE_WITHOUT_DECISION", expected: "0.00", actual: fromMinor(act) });
    else if (d?.decision === "CHARGE" && !c) mismatches.push({ appointmentId: id, kind: "NO_CHARGE_ROW_FOR_CHARGE_DECISION", expected: fromMinor(exp), actual: "0.00" });
    else if (d && d.decision !== "CHARGE" && act > 0) mismatches.push({ appointmentId: id, kind: "ACTIVE_CHARGE_FOR_NO_CHARGE_DECISION", expected: "0.00", actual: fromMinor(act) });
    else if (d?.decision === "CHARGE" && c && ACTIVE.has(c.status) && act !== exp) mismatches.push({ appointmentId: id, kind: "AMOUNT_MISMATCH", expected: fromMinor(exp), actual: fromMinor(act) });
  }
  // A CHARGE decision whose charge was reversed (dispute, cancellation, check-in revert) is explained by the charge's reversalReason, not a mismatch.
  return {
    totals: { expectedFromDecisions: fromMinor(expected), activeCharges: fromMinor(billedActive), reversedOrWaived: fromMinor(reversed) },
    byDecision,
    byOrigin,
    noChargeReasons,
    mismatches,
    reconciled: mismatches.length === 0,
  };
}
