import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { parseBillingPeriod } from "../billing-platform/settlement-period";
import { buildCreditSection, type CreditSection } from "./credit-statement";

@Injectable()
export class CreditStatementService {
  constructor(private readonly prisma: PrismaService) {}

  /** The Credit section for one calendar month (YYYY-MM). Reads the append-only ledger, so the numbers reconcile to it by construction. */
  async sectionForPeriod(tenantId: string, periodKey: string): Promise<(CreditSection & { periodKey: string; currency: string }) | null> {
    const wallet = await this.prisma.creditWallet.findUnique({ where: { tenantId } });
    const p = parseBillingPeriod(periodKey);
    if (!wallet) return null;
    const rows = await this.prisma.creditLedgerEntry.findMany({
      where: { walletId: wallet.id, createdAt: { lt: p.periodEnd } },
      select: { type: true, reason: true, category: true, amount: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });
    return { periodKey: p.periodKey, currency: wallet.currency, ...buildCreditSection(rows, p.periodStart, p.periodEnd) };
  }
}
