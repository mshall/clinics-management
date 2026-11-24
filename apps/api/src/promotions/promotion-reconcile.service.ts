import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { budgetInvariantViolations } from "./promotion-budget-math";

export interface ReconcileFinding { promotionId: string; code: "RC_S1" | "RC_S2" | "RC_S5"; detail: string }

/**
 * Daily reconciliation (GRW-P2-S), read-only:
 *  RC-S1  per promotion: sum(DEBIT) - sum(REVERSE_DEBIT)  =  wallet CONSUME (reason SPONSORED_PROMOTION) - wallet GRANT (SPONSORED_PROMOTION_REVERSAL) + shortfall still owed or invoiced
 *         (a WALLET_THEN_INVOICE shortfall is the part the wallet could not cover; it appears as an invoice line instead of a wallet entry)
 *  RC-S2  reserved + debited - released - reversed <= cap, and never negative, at the end state
 *  RC-S5  no ledger row of this module names a patient credit object (references are checked, a patient reference column does not exist)
 * Money in minor units; wallet decimals are converted with a half-up rounding to the piastre.
 */
@Injectable()
export class PromotionReconcileService {
  constructor(private readonly prisma: PrismaService) {}

  async run(tenantId?: string): Promise<{ checked: number; findings: ReconcileFinding[] }> {
    const promos = await this.prisma.sponsoredPromotion.findMany({ where: tenantId ? { tenantId } : {}, select: { id: true, tenantId: true, currentVersionId: true, versions: { select: { id: true, budgetCapMinor: true } } } });
    const findings: ReconcileFinding[] = [];
    for (const p of promos) {
      const entries = await this.prisma.promotionBudgetEntry.findMany({ where: { promotionId: p.id }, select: { type: true, amountMinor: true, versionId: true, bookingRef: true, reservationId: true } });
      const cap = p.versions.find((v) => v.id === p.currentVersionId)?.budgetCapMinor ?? Math.max(0, ...p.versions.map((v) => v.budgetCapMinor));
      for (const code of budgetInvariantViolations(entries, cap)) findings.push({ promotionId: p.id, code: "RC_S2", detail: code });
      const debitNet = entries.filter((e) => e.type === "DEBIT").reduce((s, e) => s + e.amountMinor, 0) - entries.filter((e) => e.type === "REVERSE_DEBIT").reduce((s, e) => s + e.amountMinor, 0);
      const wallet = await this.prisma.creditLedgerEntry.findMany({ where: { campaignRef: p.id, wallet: { tenantId: p.tenantId }, reason: { in: ["SPONSORED_PROMOTION", "SPONSORED_PROMOTION_REVERSAL"] } }, select: { type: true, reason: true, amount: true } });
      const minor = (d: { toString(): string }) => Math.round(Number(d.toString()) * 100);
      const consumed = wallet.filter((w) => w.reason === "SPONSORED_PROMOTION" && w.type === "CONSUME").reduce((s, w) => s + Math.abs(minor(w.amount)), 0); // CONSUME rows are stored negative
      const returned = wallet.filter((w) => w.reason === "SPONSORED_PROMOTION_REVERSAL" && w.type === "GRANT").reduce((s, w) => s + minor(w.amount), 0);
      const shortfall = (await this.prisma.promotionReservation.aggregate({ where: { promotionId: p.id, state: { in: ["DEBITED", "REVERSED"] } }, _sum: { shortfallMinor: true } }))._sum.shortfallMinor ?? 0;
      const expected = consumed - returned + shortfall;
      if (debitNet !== expected) findings.push({ promotionId: p.id, code: "RC_S1", detail: `DEBIT_NET ${debitNet} != WALLET_NET ${consumed - returned} + SHORTFALL ${shortfall}` });
      for (const e of entries) if (/(^|[:_\-/])(patient|pcl|reward|coupon|sub)([:_\-/]|$)/i.test(e.bookingRef ?? "")) findings.push({ promotionId: p.id, code: "RC_S5", detail: "REFERENCE_NAMES_PATIENT_OBJECT" });
    }
    return { checked: promos.length, findings };
  }
}
