/**
 * COM-3 settlement statement of one period, provider side (pure; no I/O). Same figures and same shape as the Kiorex statement (`GET /api/v1/admin/commissions/settlement-statement/{orgRef}`): online collections,
 * cash-visit commission accrued and netted (Kiorex never holds or pays cash: a commission on a cash visit is accrued and netted in the next bank-transfer settlement), deductions, net payable, payout bank
 * reference and reconciliation status (MATCHED / UNMATCHED / DISPUTED). Providers are paid by bank transfer only. Amounts are minor units. Nothing here moves money.
 * `normalizeStatement` is tolerant: unknown fields are dropped and a missing one reads as null / 0, so a newer or older Kiorex never breaks the page.
 */
export type ReconciliationStatus = "MATCHED" | "UNMATCHED" | "DISPUTED";
export type StatementReconciliation = ReconciliationStatus | "NO_PAYOUT";
export type StatementPayout = { payoutRef: string; paidAt: string | null; cashMinor: number; commissionDeductedMinor: number; bankReference: string | null; reconciliation: ReconciliationStatus };
export type StatementView = {
  /** KIOREX = the figures Kiorex finance sees, fetched from the platform statement API. LOCAL_MIRROR = derived from this product's own mirror of what Kiorex reported (mock mode, or Kiorex unreachable by design in dev). */
  source: "KIOREX" | "LOCAL_MIRROR";
  orgRef: string; period: { from: string; to: string }; currency: string; payoutMethod: "BANK_TRANSFER";
  onlineCollectionsMinor: number; cashVisitCommissionAccruedMinor: number; cashVisitCommissionNettedMinor: number; cashVisitCommissionOpenMinor: number; cashVisitCharges: number;
  deductions: { commissionMinor: number; feesMinor: number | null; refundsMinor: number | null; chargebacksMinor: number | null };
  commission: { totalMinor: number; collectedMinor: number; openMinor: number; disputedOpen: number };
  netPayableMinor: number; paidByBankTransferMinor: number;
  payouts: StatementPayout[]; reconciliation: StatementReconciliation;
};

const RECON: readonly string[] = ["MATCHED", "UNMATCHED", "DISPUTED"];
const int = (v: unknown, fallback = 0): number => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : fallback);
const intOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : null);
const str = (v: unknown, max = 120): string | null => (typeof v === "string" && v.length > 0 ? v.slice(0, max) : null);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const isoOrNull = (v: unknown): string | null => (typeof v === "string" && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : null);

/** `YYYY-MM` -> [from, to) in UTC (the platform default is the calendar month, UTC). Returns null for anything else. */
export function periodRange(period: string | undefined, now = new Date()): { from: Date; to: Date; key: string } | null {
  if (!period) { const f = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)); return { from: f, to: new Date(Date.UTC(f.getUTCFullYear(), f.getUTCMonth() + 1, 1)), key: f.toISOString().slice(0, 7) }; }
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) return null;
  return { from: new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1)), to: new Date(Date.UTC(Number(m[1]), Number(m[2]), 1)), key: period };
}

export function normalizeStatement(raw: unknown, source: StatementView["source"], fallback: { orgRef: string; from: Date; to: Date }): StatementView | null {
  const o = obj(raw);
  if (Object.keys(o).length === 0) return null;
  const d = obj(o.deductions); const c = obj(o.commission); const p = obj(o.period);
  const payouts = (Array.isArray(o.payouts) ? o.payouts : []).map((x) => {
    const r = obj(x);
    return { payoutRef: str(r.payoutRef, 80) ?? "", paidAt: isoOrNull(r.paidAt), cashMinor: int(r.cashMinor), commissionDeductedMinor: int(r.commissionDeductedMinor), bankReference: str(r.bankReference, 80), reconciliation: (RECON.includes(String(r.reconciliation)) ? r.reconciliation : "UNMATCHED") as ReconciliationStatus };
  }).filter((x) => x.payoutRef);
  const rec = String(o.reconciliation);
  return {
    source, orgRef: str(o.orgRef, 64) ?? fallback.orgRef, period: { from: isoOrNull(p.from) ?? fallback.from.toISOString(), to: isoOrNull(p.to) ?? fallback.to.toISOString() }, currency: (str(o.currency, 3) ?? "EGP").toUpperCase(), payoutMethod: "BANK_TRANSFER",
    onlineCollectionsMinor: int(o.onlineCollectionsMinor), cashVisitCommissionAccruedMinor: int(o.cashVisitCommissionAccruedMinor), cashVisitCommissionNettedMinor: int(o.cashVisitCommissionNettedMinor),
    cashVisitCommissionOpenMinor: int(o.cashVisitCommissionOpenMinor, Math.max(0, int(o.cashVisitCommissionAccruedMinor) - int(o.cashVisitCommissionNettedMinor))), cashVisitCharges: int(o.cashVisitCharges),
    deductions: { commissionMinor: int(d.commissionMinor), feesMinor: intOrNull(d.feesMinor), refundsMinor: intOrNull(d.refundsMinor), chargebacksMinor: intOrNull(d.chargebacksMinor) },
    commission: { totalMinor: int(c.totalMinor), collectedMinor: int(c.collectedMinor), openMinor: int(c.openMinor), disputedOpen: int(c.disputedOpen) },
    netPayableMinor: int(o.netPayableMinor), paidByBankTransferMinor: int(o.paidByBankTransferMinor), payouts,
    reconciliation: (["MATCHED", "UNMATCHED", "DISPUTED", "NO_PAYOUT"].includes(rec) ? rec : "UNMATCHED") as StatementReconciliation,
  };
}

export type LocalFacts = {
  orgRef: string; from: Date; to: Date; currency: string;
  charges: { amountMinor: number; status: string; tender: string | null }[];
  claims: { collectedMinor: number; disputeStatus: string | null; tender: string | null; chargeStatus?: string | null }[];
  payouts: { payoutRef: string; paidAt: Date; cashMinor: number; commissionDeductedMinor: number }[];
};
const OUT = new Set(["REVERSED", "WAIVED"]);
const CASH_LIVE = new Set(["CONFIRMED", "BILLED", "PENDING", "DISPUTED"]);
/** Mirror statement from this product's own rows (mock mode). Refunds and chargebacks are not known here (null); a bank match cannot be seen here, so a payout reads UNMATCHED until Kiorex reports it. */
export function localStatement(f: LocalFacts): StatementView {
  const online = f.payouts.reduce((s, p) => s + p.cashMinor + p.commissionDeductedMinor, 0);
  const ded = f.payouts.reduce((s, p) => s + p.commissionDeductedMinor, 0);
  const cash = f.charges.filter((c) => c.tender === "CASH" && CASH_LIVE.has(c.status));
  const accrued = cash.reduce((s, c) => s + c.amountMinor, 0);
  const cashNetted = f.claims.filter((c) => c.tender === "CASH").reduce((s, c) => s + c.collectedMinor, 0);
  const total = f.charges.filter((c) => !OUT.has(c.status)).reduce((s, c) => s + c.amountMinor, 0);
  const collected = f.claims.reduce((s, c) => s + c.collectedMinor, 0);
  const disputed = f.claims.filter((c) => c.disputeStatus === "OPEN").length;
  const payouts = f.payouts.map((p) => ({ payoutRef: p.payoutRef, paidAt: p.paidAt.toISOString(), cashMinor: p.cashMinor, commissionDeductedMinor: p.commissionDeductedMinor, bankReference: null, reconciliation: (disputed > 0 ? "DISPUTED" : "UNMATCHED") as ReconciliationStatus }));
  return {
    source: "LOCAL_MIRROR", orgRef: f.orgRef, period: { from: f.from.toISOString(), to: f.to.toISOString() }, currency: f.currency, payoutMethod: "BANK_TRANSFER",
    onlineCollectionsMinor: online, cashVisitCommissionAccruedMinor: accrued, cashVisitCommissionNettedMinor: cashNetted, cashVisitCommissionOpenMinor: Math.max(0, accrued - cashNetted), cashVisitCharges: cash.length,
    deductions: { commissionMinor: ded, feesMinor: null, refundsMinor: null, chargebacksMinor: null }, commission: { totalMinor: total, collectedMinor: collected, openMinor: Math.max(0, total - collected), disputedOpen: disputed },
    netPayableMinor: online - ded, paidByBankTransferMinor: f.payouts.reduce((s, p) => s + p.cashMinor, 0), payouts, reconciliation: disputed > 0 ? "DISPUTED" : payouts.length === 0 ? "NO_PAYOUT" : "UNMATCHED",
  };
}

const major = (m: number | null) => (m === null ? "" : (m / 100).toFixed(2));
const cell = (v: unknown): string => { let s = v == null ? "" : String(v); if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`; return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
/** Same rows as the Kiorex export (item, amount, deducted, bankReference, status) so both sides open the same file. */
export function statementCsv(s: StatementView): { filename: string; body: string; rows: number } {
  const rows: unknown[][] = [
    ["onlineCollections", major(s.onlineCollectionsMinor)], ["cashVisitCommissionAccrued", major(s.cashVisitCommissionAccruedMinor)], ["cashVisitCommissionNetted", major(s.cashVisitCommissionNettedMinor)],
    ["deductionCommission", major(s.deductions.commissionMinor)], ["deductionFees", major(s.deductions.feesMinor)], ["deductionRefunds", major(s.deductions.refundsMinor)], ["deductionChargebacks", major(s.deductions.chargebacksMinor)],
    ["netPayable", major(s.netPayableMinor)], ["paidByBankTransfer", major(s.paidByBankTransferMinor)], ["reconciliation", s.reconciliation],
    ...s.payouts.map((p) => [`payout:${p.payoutRef}`, major(p.cashMinor), major(p.commissionDeductedMinor), p.bankReference ?? "", p.reconciliation]),
  ];
  const body = `﻿${[["item", "amount", "deducted", "bankReference", "status"], ...rows].map((r) => r.map(cell).join(",")).join("\r\n")}\r\n`;
  return { filename: `settlement-${s.orgRef}-${s.period.from.slice(0, 10)}.csv`, body, rows: rows.length };
}
