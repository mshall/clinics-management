import { Injectable, Logger } from "@nestjs/common";
import { CreditEntryType, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CreditWalletService } from "./credit-wallet.service";

export type ReconcileReport = { wallets: number; repaired: number; expired: number; mismatches: number; details: { tenantId: string; issue: string; expected?: string; actual?: string }[] };

/** GRW-P2-W daily report on top of the existing maintenance: W-7 (Sigma ledger = balance, extended to Sigma remaining of the grant lots), reservations never exceed what can back them, unit ledger never negative. */
@Injectable()
export class CreditReconcileService {
  private readonly log = new Logger(CreditReconcileService.name);
  constructor(private readonly prisma: PrismaService, private readonly wallet: CreditWalletService) {}

  async run(): Promise<ReconcileReport> {
    const m = await this.wallet.runDailyCreditMaintenance(); // expiry sweep, then Sigma ledger = balance repair
    const details: ReconcileReport["details"] = [];
    const wallets = await this.prisma.creditWallet.findMany({ select: { id: true, tenantId: true, balance: true } });
    for (const w of wallets) {
      const lots = await this.prisma.creditLedgerEntry.aggregate({ where: { walletId: w.id, type: CreditEntryType.GRANT, remaining: { gt: 0 } }, _sum: { remaining: true } });
      const remaining = lots._sum.remaining ?? new Prisma.Decimal(0);
      if (!remaining.equals(w.balance)) details.push({ tenantId: w.tenantId, issue: "REMAINING_NOT_BALANCE", expected: w.balance.toFixed(2), actual: remaining.toFixed(2) });
      const held = await this.prisma.creditReservation.aggregate({ where: { walletId: w.id, state: "RESERVED" }, _sum: { amount: true } });
      if ((held._sum.amount ?? new Prisma.Decimal(0)).gt(w.balance)) details.push({ tenantId: w.tenantId, issue: "RESERVED_EXCEEDS_BALANCE", expected: w.balance.toFixed(2), actual: (held._sum.amount ?? 0).toString() });
    }
    const negative = await this.prisma.usageUnitLedger.groupBy({ by: ["tenantId", "unit"], _sum: { delta: true }, having: { delta: { _sum: { lt: 0 } } } });
    for (const n of negative) details.push({ tenantId: n.tenantId, issue: "NEGATIVE_UNITS", actual: String(n._sum.delta) });
    const report: ReconcileReport = { wallets: wallets.length, repaired: m.repairedWallets, expired: m.expiredWallets, mismatches: details.length, details };
    await this.prisma.creditReconcileRun.create({ data: { wallets: report.wallets, repaired: report.repaired, expired: report.expired, mismatches: report.mismatches, details: details.slice(0, 200) as unknown as Prisma.InputJsonValue } });
    if (report.mismatches > 0) this.log.warn(`credit reconcile: ${report.mismatches} mismatch(es)`);
    return report;
  }
}
