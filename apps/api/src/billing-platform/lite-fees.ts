import { roundMoney } from "./settlement-rounding";
import type { SettlementCalculatorResult } from "./settlement-calculator";

/** SB-05: "Kiorex fees this month" card for Lite (commission-only) tenants. */
export type LiteKiorexFeesSummary = {
  periodKey: string;
  currency: string;
  isLite: boolean;
  patientsAttended: number;
  feesThisMonth: string;
  carriedForward: string;
  projectedTotal: string;
  minInvoice: string;
  /** True when this month's fees + carry reach the minimum invoice (an invoice will be issued). */
  willInvoice: boolean;
  /** Balance that rolls into next month when below the minimum. */
  carryToNextMonth: string;
};

export function liteKiorexFeesFromSettlement(opts: {
  periodKey: string;
  currency: string;
  isLite: boolean;
  calculation: SettlementCalculatorResult;
}): LiteKiorexFeesSummary {
  const s = opts.calculation.summary;
  const fees = roundMoney(Number(s.commissionGross));
  const carry = roundMoney(Number(s.carryForwardIn));
  const projected = roundMoney(fees + carry);
  const min = roundMoney(Number(s.liteMinInvoice));
  const willInvoice = projected > 0 && projected >= min;
  return {
    periodKey: opts.periodKey,
    currency: opts.currency,
    isLite: opts.isLite,
    patientsAttended: s.kiorexPatientCount,
    feesThisMonth: fees.toFixed(2),
    carriedForward: carry.toFixed(2),
    projectedTotal: projected.toFixed(2),
    minInvoice: min.toFixed(2),
    willInvoice,
    carryToNextMonth: (willInvoice ? 0 : projected).toFixed(2),
  };
}
