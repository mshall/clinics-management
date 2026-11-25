import { BankIpnAdapter, type BankIpnConfig, type MatchTarget } from "@kiorex/pay-contract";

/** The neutral bank IPN layout used until the bank's real file spec arrives (NEEDS_HUMAN LG-INT-PAY-12). `CLINIC_BANK_IPN_CONFIG_JSON` overrides it; a bad override never half-applies. */
export const DEFAULT_CLINIC_IPN: BankIpnConfig = {
  name: "bank_ipn",
  columns: { bankRef: "bankRef", amount: "amount", currency: "currency", reference: "reference", paidAt: "paidAt", payer: "payer", status: "status", kind: "type" },
  amountUnit: "major",
  defaultCurrency: "EGP",
  successStatuses: ["success", "completed", "settled", "ok"],
  reversalKinds: ["reversal", "refund", "return"],
};
export function clinicIpnConfig(env: Record<string, string | undefined> = process.env): BankIpnConfig {
  try {
    const j = JSON.parse(env.CLINIC_BANK_IPN_CONFIG_JSON ?? "{}");
    if (j && typeof j === "object" && !Array.isArray(j)) return { ...DEFAULT_CLINIC_IPN, ...j, columns: { ...DEFAULT_CLINIC_IPN.columns, ...(j.columns ?? {}) } };
  } catch { /* neutral layout stays */ }
  return DEFAULT_CLINIC_IPN;
}
export const clinicIpnAdapter = (env = process.env) => new BankIpnAdapter(clinicIpnConfig(env), env.CLINIC_BANK_IPN_WEBHOOK_SECRET ?? "");

export const toMinor = (n: number | { toString(): string }): number => Math.round(Number(n.toString()) * 100);
export const fromMinor = (m: number): number => Math.round(m) / 100;

export interface InvoiceForMatch { id: string; invoiceNumber: string; clinicId: string; tenantId: string; currency: string; issueDate: Date; patientName: string; lines: { amountPaid: { toString(): string } }[]; billingPayments: { totalAmount: { toString(): string } }[] }
/** Outstanding minor units of an invoice: sum of its lines minus what billing payments already cover. */
export const outstandingMinor = (i: Pick<InvoiceForMatch, "lines" | "billingPayments">): number => Math.max(0, i.lines.reduce((s, l) => s + toMinor(l.amountPaid), 0) - i.billingPayments.reduce((s, p) => s + toMinor(p.totalAmount), 0));
export function invoiceTargets(invoices: InvoiceForMatch[]): MatchTarget[] {
  return invoices.map((i) => ({ id: i.id, kind: "CLINIC_INVOICE" as const, reference: i.invoiceNumber, amountMinor: outstandingMinor(i), currency: i.currency, issuedAt: i.issueDate.toISOString(), payerName: i.patientName, branchId: i.clinicId, organisationId: i.tenantId, settled: outstandingMinor(i) <= 0 })).filter((t) => t.amountMinor > 0);
}

/** Roles that may see and decide the matching queue and the money rollups. Finance-only by design: front-desk, nurses and branch staff cannot. */
export const PAY_FINANCE_ROLES: readonly string[] = ["PLATFORM_SUPER_ADMIN", "GROUP_ADMIN", "FINANCE_OFFICER"];
