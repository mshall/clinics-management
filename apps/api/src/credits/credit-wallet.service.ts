import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import {
  CreditEntryType,
  CreditReason,
  Prisma,
  type CreditLedgerEntry,
  type CreditWallet,
} from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { isPlatformSuperAdmin } from "../common/platform-super-admin";
import { parsePageParams } from "../common/pagination";
import { PrismaService } from "../prisma/prisma.service";
import {
  allocateConsumeFifo,
  decimalAmount,
  grantLotsFromEntries,
  sumLedgerAmounts,
  type GrantLot,
} from "./credit-wallet-math";
import { dualApprovalThresholdFromMarket } from "./credit-wallet.config";

const MAX_GRANT_RETRIES = 5;

type Tx = Prisma.TransactionClient;

export type CreditWalletView = {
  balance: string;
  currency: string;
  version: number;
  upcomingExpiries: {
    expiresAt: string;
    amount: string;
    entryId: string;
  }[];
  entries: {
    id: string;
    type: CreditEntryType;
    reason: CreditReason;
    amount: string;
    remaining: string | null;
    expiresAt: string | null;
    note: string | null;
    createdAt: string;
  }[];
  page: number;
  pageSize: number;
  total: number;
};

@Injectable()
export class CreditWalletService {
  private readonly log = new Logger(CreditWalletService.name);

  constructor(private readonly prisma: PrismaService) {}

  async ensureWallet(tenantId: string, tx: Tx = this.prisma): Promise<CreditWallet> {
    const existing = await tx.creditWallet.findUnique({ where: { tenantId } });
    if (existing) return existing;
    const tenant = await tx.tenant.findUnique({
      where: { id: tenantId },
      select: { baseCurrency: true },
    });
    if (!tenant) throw new NotFoundException("Organization not found");
    try {
      return await tx.creditWallet.create({
        data: { tenantId, currency: tenant.baseCurrency, balance: 0, version: 0 },
      });
    } catch {
      const again = await tx.creditWallet.findUnique({ where: { tenantId } });
      if (again) return again;
      throw new ConflictException("Could not provision credit wallet");
    }
  }

  async getWalletForTenant(user: JwtUser, tenantId: string, page?: number, pageSize?: number): Promise<CreditWalletView> {
    if (user.tenantId !== tenantId) throw new ForbiddenException();
    return this.getWalletView(tenantId, page, pageSize);
  }

  async getWalletView(tenantId: string, pageRaw?: number, pageSizeRaw?: number): Promise<CreditWalletView> {
    const wallet = await this.ensureWallet(tenantId);
    const { page, pageSize, skip } = parsePageParams(
      pageRaw != null ? String(pageRaw) : undefined,
      pageSizeRaw != null ? String(pageSizeRaw) : undefined,
    );

    const now = new Date();
    const [upcoming, total, rows] = await Promise.all([
      this.prisma.creditLedgerEntry.findMany({
        where: {
          walletId: wallet.id,
          type: CreditEntryType.GRANT,
          remaining: { gt: 0 },
          expiresAt: { not: null, gt: now },
        },
        orderBy: { expiresAt: "asc" },
        take: 10,
      }),
      this.prisma.creditLedgerEntry.count({ where: { walletId: wallet.id } }),
      this.prisma.creditLedgerEntry.findMany({
        where: { walletId: wallet.id },
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
      }),
    ]);

    return {
      balance: wallet.balance.toFixed(2),
      currency: wallet.currency,
      version: wallet.version,
      upcomingExpiries: upcoming.map((u) => ({
        expiresAt: u.expiresAt!.toISOString(),
        amount: (u.remaining ?? u.amount).toFixed(2),
        entryId: u.id,
      })),
      entries: rows.map(serializeLedgerRow),
      page,
      pageSize,
      total,
    };
  }

  async grantManual(
    actor: JwtUser,
    tenantId: string,
    body: {
      amount: number;
      reason: CreditReason;
      expiresAt?: string | null;
      note?: string;
      secondApproverUserId?: string;
    },
  ) {
    if (!isPlatformSuperAdmin(actor)) {
      throw new ForbiddenException("Only platform super administrators can grant credits");
    }
    const reason = body.reason;
    if (!reason) throw new BadRequestException("reason is required");
    const note = body.note?.trim();
    if (!note) {
      throw new BadRequestException("note is required for manual credit grants");
    }
    const amount = decimalAmount(body.amount);
    if (amount.lte(0)) throw new BadRequestException("amount must be positive");

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { market: { select: { featureDefaults: true } } },
    });
    if (!tenant) throw new NotFoundException("Organization not found");

    const threshold = dualApprovalThresholdFromMarket(tenant.market?.featureDefaults);
    let secondApproverUserId: string | null = null;
    if (amount.gte(threshold)) {
      secondApproverUserId = body.secondApproverUserId?.trim() || null;
      if (!secondApproverUserId) {
        throw new BadRequestException(
          `Grants of ${threshold.toFixed(2)} or more require secondApproverUserId (platform super admin)`,
        );
      }
      if (secondApproverUserId === actor.userId) {
        throw new BadRequestException("second approver must be a different platform super administrator");
      }
      await this.assertPlatformSuperAdminUser(secondApproverUserId);
    }

    const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
    if (expiresAt && Number.isNaN(expiresAt.getTime())) {
      throw new BadRequestException("expiresAt is invalid");
    }

    const entry = await this.grantInTransaction({
      tenantId,
      amount,
      reason,
      expiresAt,
      note,
      createdBy: actor.userId,
      metadata: { secondApproverUserId, threshold: threshold.toFixed(2) },
    });

    return { entryId: entry.id, balance: (await this.prisma.creditWallet.findUniqueOrThrow({ where: { tenantId } })).balance.toFixed(2) };
  }

  private async assertPlatformSuperAdminUser(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, role: true, additionalRoles: true },
    });
    if (!user || !isPlatformSuperAdmin(user)) {
      throw new BadRequestException("secondApproverUserId must be a platform super administrator");
    }
  }

  async grantInTransaction(opts: {
    tenantId: string;
    amount: Prisma.Decimal;
    reason: CreditReason;
    expiresAt?: Date | null;
    note?: string | null;
    createdBy?: string | null;
    sourceRef?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<CreditLedgerEntry> {
    for (let attempt = 0; attempt < MAX_GRANT_RETRIES; attempt++) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const wallet = await this.ensureWallet(opts.tenantId, tx);
          const newBalance = wallet.balance.add(opts.amount);
          const updated = await tx.creditWallet.updateMany({
            where: { id: wallet.id, version: wallet.version },
            data: { balance: newBalance, version: { increment: 1 } },
          });
          if (updated.count !== 1) throw new ConflictException("wallet version conflict");

          const entry = await tx.creditLedgerEntry.create({
            data: {
              walletId: wallet.id,
              type: CreditEntryType.GRANT,
              reason: opts.reason,
              amount: opts.amount,
              remaining: opts.amount,
              expiresAt: opts.expiresAt ?? null,
              sourceRef: opts.sourceRef ?? null,
              note: opts.note ?? null,
              createdBy: opts.createdBy ?? null,
            },
          });

          await tx.auditLog.create({
            data: {
              tenantId: opts.tenantId,
              actorId: opts.createdBy ?? null,
              action: "credit.grant",
              resource: "CreditWallet",
              resourceId: wallet.id,
              metadata: {
                amount: opts.amount.toFixed(2),
                reason: opts.reason,
                note: opts.note,
                entryId: entry.id,
                ...opts.metadata,
              } as Prisma.InputJsonValue,
            },
          });

          return entry;
        });
      } catch (e) {
        if (e instanceof ConflictException && attempt < MAX_GRANT_RETRIES - 1) continue;
        throw e;
      }
    }
    throw new ConflictException("Could not grant credits");
  }

  async consume(
    tenantId: string,
    amountRaw: number | string,
    reason: CreditReason,
    opts?: { createdBy?: string; sourceRef?: string; invoiceId?: string; note?: string },
  ): Promise<CreditLedgerEntry> {
    const amount = decimalAmount(amountRaw);
    if (amount.lte(0)) throw new BadRequestException("consume amount must be positive");

    for (let attempt = 0; attempt < MAX_GRANT_RETRIES; attempt++) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const wallet = await this.ensureWallet(tenantId, tx);
          if (wallet.balance.lt(amount)) {
            throw new BadRequestException("Insufficient credit balance");
          }

          const grantRows = await tx.creditLedgerEntry.findMany({
            where: {
              walletId: wallet.id,
              type: CreditEntryType.GRANT,
              remaining: { gt: 0 },
            },
            orderBy: { createdAt: "asc" },
          });

          const simEntries = grantRows.map((r) => ({
            type: r.type,
            reason: r.reason,
            amount: r.amount,
            remaining: r.remaining,
            expiresAt: r.expiresAt,
          }));
          const lots = grantLotsFromEntries(simEntries);
          const allocations = allocateConsumeFifo(lots, amount);

          for (const alloc of allocations) {
            const row = grantRows[alloc.entryIndex];
            const prev = row.remaining ?? row.amount;
            const next = prev.sub(alloc.taken);
            await tx.creditLedgerEntry.update({
              where: { id: row.id },
              data: { remaining: next },
            });
          }

          const newBalance = wallet.balance.sub(amount);
          const updated = await tx.creditWallet.updateMany({
            where: { id: wallet.id, version: wallet.version },
            data: { balance: newBalance, version: { increment: 1 } },
          });
          if (updated.count !== 1) throw new ConflictException("wallet version conflict");

          const entry = await tx.creditLedgerEntry.create({
            data: {
              walletId: wallet.id,
              type: CreditEntryType.CONSUME,
              reason,
              amount: amount.neg(),
              sourceRef: opts?.sourceRef ?? null,
              invoiceId: opts?.invoiceId ?? null,
              note: opts?.note ?? null,
              createdBy: opts?.createdBy ?? null,
            },
          });

          await tx.auditLog.create({
            data: {
              tenantId,
              actorId: opts?.createdBy ?? null,
              action: "credit.consume",
              resource: "CreditWallet",
              resourceId: wallet.id,
              metadata: {
                amount: amount.toFixed(2),
                reason,
                entryId: entry.id,
                invoiceId: opts?.invoiceId ?? null,
              } as Prisma.InputJsonValue,
            },
          });

          return entry;
        });
      } catch (e) {
        if (e instanceof ConflictException && attempt < MAX_GRANT_RETRIES - 1) continue;
        throw e;
      }
    }
    throw new ConflictException("Could not consume credits");
  }

  async runDailyCreditMaintenance(): Promise<{ expiredWallets: number; repairedWallets: number }> {
    const expiredWallets = await this.runExpiryPasses();
    const repairedWallets = await this.verifyAllBalances();
    return { expiredWallets, repairedWallets };
  }

  private async runExpiryPasses(): Promise<number> {
    const now = new Date();
    const due = await this.prisma.creditLedgerEntry.findMany({
      where: {
        type: CreditEntryType.GRANT,
        remaining: { gt: 0 },
        expiresAt: { lte: now },
      },
      select: { walletId: true },
      distinct: ["walletId"],
    });
    let count = 0;
    for (const row of due) {
      const wallet = await this.prisma.creditWallet.findUnique({ where: { id: row.walletId } });
      if (!wallet) continue;
      try {
        await this.expireWallet(wallet.tenantId, now);
        count += 1;
      } catch (e) {
        this.log.warn(e instanceof Error ? e.message : String(e));
      }
    }
    return count;
  }

  private async expireWallet(tenantId: string, asOf: Date): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const wallet = await this.ensureWallet(tenantId, tx);
      const grants = await tx.creditLedgerEntry.findMany({
        where: {
          walletId: wallet.id,
          type: CreditEntryType.GRANT,
          remaining: { gt: 0 },
          expiresAt: { lte: asOf },
        },
      });
      if (grants.length === 0) return;

      let totalExpired = new Prisma.Decimal(0);
      for (const g of grants) {
        const chunk = g.remaining ?? new Prisma.Decimal(0);
        if (chunk.lte(0)) continue;
        totalExpired = totalExpired.add(chunk);
        await tx.creditLedgerEntry.update({
          where: { id: g.id },
          data: { remaining: 0 },
        });
        await tx.creditLedgerEntry.create({
          data: {
            walletId: wallet.id,
            type: CreditEntryType.EXPIRE,
            reason: CreditReason.ADJUSTMENT,
            amount: chunk.neg(),
            note: `Expired grant ${g.id}`,
          },
        });
      }

      if (totalExpired.lte(0)) return;

      const fresh = await tx.creditWallet.findUniqueOrThrow({ where: { id: wallet.id } });
      const newBalance = fresh.balance.sub(totalExpired);
      if (newBalance.lt(0)) throw new Error("expire would drive balance negative");

      const updated = await tx.creditWallet.updateMany({
        where: { id: wallet.id, version: fresh.version },
        data: { balance: newBalance, version: { increment: 1 } },
      });
      if (updated.count !== 1) throw new ConflictException("wallet version conflict during expiry");
    });
  }

  private async verifyAllBalances(): Promise<number> {
    const wallets = await this.prisma.creditWallet.findMany({ select: { id: true, tenantId: true, balance: true, version: true } });
    let repaired = 0;
    for (const wallet of wallets) {
      const rows = await this.prisma.creditLedgerEntry.findMany({
        where: { walletId: wallet.id },
        select: { amount: true },
      });
      const computed = sumLedgerAmounts(rows);
      if (computed.equals(wallet.balance)) continue;

      await this.prisma.creditWallet.update({
        where: { id: wallet.id },
        data: { balance: computed, version: { increment: 1 } },
      });
      await this.prisma.auditLog.create({
        data: {
          tenantId: wallet.tenantId,
          actorId: null,
          action: "credit.balance_reconciled",
          resource: "CreditWallet",
          resourceId: wallet.id,
          metadata: {
            previousBalance: wallet.balance.toFixed(2),
            computedBalance: computed.toFixed(2),
          } as Prisma.InputJsonValue,
        },
      });
      repaired += 1;
      this.log.warn(`Reconciled credit wallet ${wallet.id} for tenant ${wallet.tenantId}`);
    }
    return repaired;
  }
}

function serializeLedgerRow(row: CreditLedgerEntry) {
  return {
    id: row.id,
    type: row.type,
    reason: row.reason,
    amount: row.amount.toFixed(2),
    remaining: row.remaining != null ? row.remaining.toFixed(2) : null,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
  };
}