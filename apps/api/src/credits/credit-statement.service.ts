import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { parseBillingPeriod } from "../billing-platform/settlement-period";
import { buildCreditSection, type CreditSection } from "./credit-statement";

@Injectable()
export class CreditStatementService {
  constructor(private readonly prisma: PrismaService) {}

  /** The Credit section for one calendar month (YYYY-MM). Reads the append-only ledger, so the numbers reconcile to it by construction. */
  async sectionForPeriod(tenantId: string, periodKey: string): Promise<(CreditSection & { periodKey: string; currency: string }) | null> {
    let p: ReturnType<typeof parseBillingPeriod>;
    try { p = parseBillingPeriod(periodKey); } catch { throw new BadRequestException({ code: "INVALID_PERIOD", message: "The period must be a calendar month written YYYY-MM" }); }
    const wallet = await this.prisma.creditWallet.findUnique({ where: { tenantId } });
    if (!wallet) return null;
    const rows = await this.prisma.creditLedgerEntry.findMany({
      where: { walletId: wallet.id, createdAt: { lt: p.periodEnd } },
      select: { type: true, reason: true, category: true, amount: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });
    return { periodKey: p.periodKey, currency: wallet.currency, ...buildCreditSection(rows, p.periodStart, p.periodEnd) };
  }
}
