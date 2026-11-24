import { BadRequestException, Injectable, Optional } from "@nestjs/common";
import { CreditReason, KiorlyLineType, Prisma } from "@prisma/client";
import { FeatureFlagsService, flagOn } from "../feature-flags/feature-flags-public";
import type { CreditUse } from "./credit-categories";
import { applyCreditToCharges, type ChargeLine } from "./credit-wallet-math";
import { CreditWalletService } from "./credit-wallet.service";

type Tx = Prisma.TransactionClient;
type InvoiceLine = { id?: string; type: KiorlyLineType; amount: Prisma.Decimal | string | number };

/** Which use of credit an invoice line is (null = credit never pays it: tax, discounts and offsets already on the invoice). */
export function useOfInvoiceLine(type: KiorlyLineType): CreditUse | null {
  switch (type) {
    case KiorlyLineType.KIOREX_COMMISSION:
    case KiorlyLineType.KIOREX_COMMISSION_OFFSET:
      return "KIOREX_FEES";
    case KiorlyLineType.SUBSCRIPTION:
    case KiorlyLineType.SEAT:
    case KiorlyLineType.ADDON:
    case KiorlyLineType.USAGE_OVERAGE:
    case KiorlyLineType.PREPAID:
      return "SUBSCRIPTION";
    default:
      return null;
  }
}

export const REASON_OF_USE: Partial<Record<CreditUse, CreditReason>> = {
  KIOREX_FEES: CreditReason.KIOREX_FEE_OFFSET,
  SUBSCRIPTION: CreditReason.SUBSCRIPTION_OFFSET,
};

/**
 * GRW-P2-W fee draw-down: for an invoice, credit pays first (first-expiring lot first), the invoice keeps the remainder, never negative, never more than
 * the payable of a line. One CONSUME per use (commission, subscription) with the invoice id and an idempotency key, so statements show separate lines.
 * `creditsApplied` on the invoice (decided by the settlement's higher-of rule, unchanged: ADR-007/008) is the ceiling.
 */
@Injectable()
export class CreditFeeDrawdownService {
  constructor(
    private readonly wallet: CreditWalletService,
    @Optional() private readonly flags?: FeatureFlagsService,
  ) {}

  /**
   * Pure split of `creditsApplied` across what each use actually owes on the invoice (lines netted per use: the higher-of offset reduces commission,
   * a prepaid period reduces the subscription), commission first then subscription. Anything above that (tax edge cases) is returned as `other`.
   */
  splitCredit(lines: InvoiceLine[], creditsApplied: Prisma.Decimal): { byUse: Map<CreditUse, Prisma.Decimal>; other: Prisma.Decimal } {
    const net = new Map<CreditUse, Prisma.Decimal>();
    for (const l of lines) {
      const use = useOfInvoiceLine(l.type);
      if (!use) continue;
      net.set(use, (net.get(use) ?? new Prisma.Decimal(0)).add(new Prisma.Decimal(String(l.amount))));
    }
    let ceiling = creditsApplied;
    const byUse = new Map<CreditUse, Prisma.Decimal>();
    for (const use of ["KIOREX_FEES", "SUBSCRIPTION"] as CreditUse[]) {
      const owed = net.get(use);
      if (!owed || owed.lte(0) || ceiling.lte(0)) continue;
      const cap = Prisma.Decimal.min(owed, ceiling);
      ceiling = ceiling.sub(cap);
      byUse.set(use, cap);
    }
    return { byUse, other: ceiling };
  }

  /**
   * Consume the credit an invoice applies. v2 OFF: today's single ADJUSTMENT consume. Replays are safe (keys per invoice and use).
   * Returns the consumed amounts by use for the statement and the audit trail.
   */
  async consumeForInvoice(tenantId: string, invoice: { id: string; number: string; creditsApplied: Prisma.Decimal }, lines: InvoiceLine[], actorUserId?: string, tx?: Tx) {
    const applied = invoice.creditsApplied;
    if (applied.lte(0)) return { consumed: [] as { use: CreditUse | "OTHER"; amount: string }[] };
    if (!(await flagOn(this.flags, tenantId, "clinic.provider_credit_v2"))) {
      await this.wallet.consume(tenantId, applied.toFixed(2), CreditReason.ADJUSTMENT, { createdBy: actorUserId, invoiceId: invoice.id, note: `Credits applied to Kiorly invoice ${invoice.number}`, tx });
      return { consumed: [{ use: "OTHER" as const, amount: applied.toFixed(2) }] };
    }
    const { byUse, other } = this.splitCredit(lines, applied);
    const consumed: { use: CreditUse | "OTHER"; amount: string }[] = [];
    for (const [use, amount] of byUse) {
      const reason = REASON_OF_USE[use] ?? CreditReason.ADJUSTMENT;
      const o = {
        createdBy: actorUserId, invoiceId: invoice.id, idempotencyKey: `invoice:${invoice.id}:credit:${use}`,
        note: `Credit applied to ${use === "KIOREX_FEES" ? "Kiorex fees" : "subscription"} on Kiorly invoice ${invoice.number}`, tx,
      };
      try {
        await this.wallet.consume(tenantId, amount.toFixed(2), reason, { ...o, use });
      } catch (e) {
        // an expired lot the daily sweep has not removed yet still counts in the balance the settlement used: keep today's behaviour (untyped FIFO) for it
        if (!(e instanceof BadRequestException) || tx) throw e;
        await this.wallet.consume(tenantId, amount.toFixed(2), reason, { ...o, untyped: true });
      }
      consumed.push({ use, amount: amount.toFixed(2) });
    }
    if (other.gt(0)) {
      await this.wallet.consume(tenantId, other.toFixed(2), CreditReason.ADJUSTMENT, { createdBy: actorUserId, invoiceId: invoice.id, idempotencyKey: `invoice:${invoice.id}:credit:OTHER`, note: `Credits applied to Kiorly invoice ${invoice.number}`, tx });
      consumed.push({ use: "OTHER", amount: other.toFixed(2) });
    }
    return { consumed };
  }

  /** Preview for a set of charges without writing: what credit would cover and what stays payable. */
  async preview(tenantId: string, lines: ChargeLine[], at = new Date()) {
    const r = await this.wallet.previewApplicable(tenantId, lines, at);
    return { lines: r.lines.map((l) => ({ key: l.key, use: l.use, amount: l.amount.toFixed(2), credit: l.credit.toFixed(2), payable: l.payable.toFixed(2) })), totalCredit: r.totalCredit.toFixed(2), totalPayable: r.totalPayable.toFixed(2) };
  }
}
export { applyCreditToCharges };
