import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Optional,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import {
  CreditEntryType,
  CreditReason,
  Prisma,
  type CreditCategory,
  type CreditLedgerEntry,
  type CreditWallet,
} from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { isPlatformSuperAdmin } from "../common/platform-super-admin";
import { parsePageParams } from "../common/pagination";
import { PrismaService } from "../prisma/prisma.service";
import { OutboxEventService } from "../messaging/outbox-event.service";
import { OUTBOX_TARGET_INTERNAL } from "../messaging/outbox-event-types";
import {
  allocateConsumeFifo,
  applyCreditToCharges,
  decimalAmount,
  grantLotsFromEntries,
  spendableForUse,
  sumLedgerAmounts,
  type ChargeLine,
  type CreditLotView,
} from "./credit-wallet-math";
import {
  CREDIT_USES,
  MANUAL_GRANT_REASONS,
  PROMOTIONAL_CATEGORIES,
  USE_OF_REASON,
  categoryOfReason,
  defaultExpiryFor,
  lotSpendableFor,
  namesPatientLedgerObject,
  type CreditUse,
} from "./credit-categories";
import { dualApprovalThresholdFromMarket } from "./credit-wallet.config";

const MAX_GRANT_RETRIES = 5;

type Tx = Prisma.TransactionClient;

export type GrantOpts = {
  tenantId: string;
  amount: Prisma.Decimal;
  reason: CreditReason;
  expiresAt?: Date | null;
  note?: string | null;
  createdBy?: string | null;
  sourceRef?: string | null;
  metadata?: Record<string, unknown>;
  category?: CreditCategory;
  campaignRef?: string | null;
  restrictions?: { spendableOn?: CreditUse[] } | null;
  /** W-6: `(walletId, idempotencyKey)` is unique; a replay returns the first entry. */
  idempotencyKey?: string | null;
  tx?: Tx;
};

export type ConsumeOpts = {
  createdBy?: string;
  sourceRef?: string;
  invoiceId?: string;
  note?: string;
  campaignRef?: string;
  idempotencyKey?: string;
  /** What the credit pays for; draws only from unexpired lots whose category allows it. Defaults from the reason. */
  use?: CreditUse;
  /** Legacy behaviour: draw from any lot with something left (an expired lot the daily sweep has not removed yet). */
  untyped?: boolean;
  tx?: Tx;
};

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
    category: CreditCategory | null;
    note: string | null;
    createdAt: string;
  }[];
  page: number;
  pageSize: number;
  total: number;
  /** GRW-P2-W (additive): lots by expiry and category, what the credit can pay for, and budget held for sponsored promotions. */
  lots?: { id: string; reason: CreditReason; category: CreditCategory; remaining: string; expiresAt: string | null }[];
  spendableByUse?: Record<CreditUse, string>;
  reserved?: string;
  canPayFor?: Record<CreditUse, boolean>;
};

@Injectable()
export class CreditWalletService {
  private readonly log = new Logger(CreditWalletService.name);

  constructor(private readonly prisma: PrismaService, @Optional() private readonly outbox?: OutboxEventService) {}

  /**
   * Provider credit events (contracts 1.12.0 `ProviderCreditGranted`, `ProviderCreditConsumed`, `ProviderCreditExpired`): INTERNAL to the Clinic, written in the same transaction as the ledger entry.
   * Tenant reference, category, reason code, amount in minor units and currency only. Never a patient field: this wallet is the provider's, a different system from the patient credit.
   */
  private async emitCredit(tx: Tx, type: "ProviderCreditGranted" | "ProviderCreditConsumed" | "ProviderCreditExpired", w: { id: string; tenantId: string; currency: string }, category: string, reason: string, amount: Prisma.Decimal): Promise<void> {
    if (!this.outbox) return;
    const amountMinor = Math.round(Math.abs(Number(amount.toFixed(2))) * 100);
    if (amountMinor < 1) return;
    await this.outbox.enqueueEvent({ tenantId: w.tenantId, type, aggregateType: "CreditWallet", aggregateId: w.id, target: OUTBOX_TARGET_INTERNAL, payload: { walletRef: w.id, orgRef: w.tenantId, category, reason: /^[A-Z][A-Z0-9_]{2,63}$/.test(reason) ? reason : "OTHER", amountMinor, currency: w.currency, at: new Date().toISOString() } }, tx as never);
  }

  async ensureWallet(tenantId: string, tx: Tx = this.prisma): Promise<CreditWallet> {
    const existing = await tx.creditWallet.findUnique({ where: { tenantId } });
    if (existing) return existing;
    const tenant = await tx.tenant.findUnique({
      where: { id: tenantId },
      select: { baseCurrency: true },
    });
    if (!tenant) throw new NotFoundException("Organization not found");
    // INSERT .. ON CONFLICT DO NOTHING: two first writers racing inside transactions never abort each other (a failed INSERT would poison the transaction)
    await tx.$executeRaw`INSERT INTO "CreditWallet" ("id", "tenantId", "currency", "balance", "version", "createdAt", "updatedAt") VALUES (${randomUUID()}, ${tenantId}, ${tenant.baseCurrency}, 0, 0, now(), now()) ON CONFLICT ("tenantId") DO NOTHING`;
    return tx.creditWallet.findUniqueOrThrow({ where: { tenantId } });
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

    const lots = await this.listLots(tenantId);
    const spendableByUse = Object.fromEntries(CREDIT_USES.map((u) => [u, spendableForUse(lots, u, now).toFixed(2)])) as Record<CreditUse, string>;
    const reservedAgg = await this.prisma.creditReservation.aggregate({ where: { walletId: wallet.id, state: "RESERVED" }, _sum: { amount: true } });
    return {
      lots: lots.map((l) => ({ id: l.id, reason: l.reason, category: l.category ?? categoryOfReason(l.reason), remaining: l.remaining.toFixed(2), expiresAt: l.expiresAt?.toISOString() ?? null })),
      spendableByUse,
      reserved: (reservedAgg._sum.amount ?? new Prisma.Decimal(0)).toFixed(2),
      canPayFor: Object.fromEntries(CREDIT_USES.map((u) => [u, Number(spendableByUse[u]) > 0])) as Record<CreditUse, boolean>,
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
    if (!MANUAL_GRANT_REASONS.includes(reason)) throw new BadRequestException("reason cannot be granted by hand");
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
    if (expiresAt && expiresAt.getTime() <= Date.now()) throw new BadRequestException("expiresAt must be in the future");

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

  /** Credit config of the tenant's market (`featureDefaults.credit`): expiry months only; amounts of grants live with the grant service. */
  private async expiryConfig(tx: Tx, tenantId: string): Promise<{ promotionalExpiryMonths?: number; recoveryExpiryMonths?: number }> {
    const t = await tx.tenant.findUnique({ where: { id: tenantId }, select: { market: { select: { featureDefaults: true } } } });
    const fd = t?.market?.featureDefaults as Record<string, unknown> | null | undefined;
    const c = fd && typeof fd === "object" ? (fd.credit as Record<string, unknown> | undefined) : undefined;
    const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 && v <= 120 ? Math.floor(v) : undefined);
    return { promotionalExpiryMonths: num(c?.promotionalExpiryMonths), recoveryExpiryMonths: num(c?.recoveryExpiryMonths) };
  }

  private assertNoPatientRefs(...refs: (string | null | undefined)[]): void {
    for (const r of refs) {
      if (namesPatientLedgerObject(r)) throw new BadRequestException("provider credit references must not name a patient ledger object");
    }
  }

  async grantInTransaction(opts: GrantOpts): Promise<CreditLedgerEntry> {
    if (opts.tx) return this.grantInTx(opts.tx, opts);
    for (let attempt = 0; attempt < MAX_GRANT_RETRIES; attempt++) {
      try {
        return await this.prisma.$transaction((tx) => this.grantInTx(tx, opts));
      } catch (e) {
        if (e instanceof ConflictException && attempt < MAX_GRANT_RETRIES - 1) continue;
        throw e;
      }
    }
    throw new ConflictException("Could not grant credits");
  }

  private async grantInTx(tx: Tx, opts: GrantOpts): Promise<CreditLedgerEntry> {
    if (opts.amount.lte(0)) throw new BadRequestException("grant amount must be positive");
    this.assertNoPatientRefs(opts.sourceRef, opts.idempotencyKey, opts.campaignRef);
    const wallet = await this.ensureWallet(opts.tenantId, tx);
    if (opts.idempotencyKey) {
      const existing = await tx.creditLedgerEntry.findUnique({ where: { walletId_idempotencyKey: { walletId: wallet.id, idempotencyKey: opts.idempotencyKey } } });
      if (existing) return existing; // W-6 replay: same entry, no second grant
    }
    const category = opts.category ?? categoryOfReason(opts.reason);
    const now = new Date();
    let expiresAt = opts.expiresAt ?? null;
    // W-4: every grant expires except an explicit ADJUSTMENT; promotional categories always expire
    if (!expiresAt && (opts.reason !== CreditReason.ADJUSTMENT || PROMOTIONAL_CATEGORIES.includes(category))) {
      expiresAt = defaultExpiryFor(category, now, await this.expiryConfig(tx, opts.tenantId));
    }

    const updated = await tx.creditWallet.updateMany({
      where: { id: wallet.id, version: wallet.version },
      data: { balance: wallet.balance.add(opts.amount), version: { increment: 1 } },
    });
    if (updated.count !== 1) throw new ConflictException("wallet version conflict");

    const entry = await tx.creditLedgerEntry.create({
      data: {
        walletId: wallet.id,
        type: CreditEntryType.GRANT,
        reason: opts.reason,
        amount: opts.amount,
        remaining: opts.amount,
        expiresAt,
        sourceRef: opts.sourceRef ?? null,
        note: opts.note ?? null,
        createdBy: opts.createdBy ?? null,
        category,
        campaignRef: opts.campaignRef ?? null,
        restrictions: (opts.restrictions ?? undefined) as Prisma.InputJsonValue | undefined,
        idempotencyKey: opts.idempotencyKey ?? null,
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
          category,
          note: opts.note,
          entryId: entry.id,
          ...opts.metadata,
        } as Prisma.InputJsonValue,
      },
    });
    await this.emitCredit(tx, "ProviderCreditGranted", wallet, category, opts.reason, opts.amount);
    return entry;
  }

  /** Lots with something left, as pure views (read only). */
  async listLots(tenantId: string, tx: Tx = this.prisma): Promise<CreditLotView[]> {
    const wallet = await this.ensureWallet(tenantId, tx);
    const rows = await tx.creditLedgerEntry.findMany({
      where: { walletId: wallet.id, type: CreditEntryType.GRANT, remaining: { gt: 0 } },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((r, seq) => ({ id: r.id, remaining: r.remaining ?? r.amount, expiresAt: r.expiresAt, reason: r.reason, category: r.category, restrictions: r.restrictions, seq }));
  }

  /** What credit would pay now, line by line, without writing anything (invoice preview, checkout hints). */
  async previewApplicable(tenantId: string, lines: ChargeLine[], at = new Date()) {
    return applyCreditToCharges(lines, await this.listLots(tenantId), at);
  }

  async consume(tenantId: string, amountRaw: number | string, reason: CreditReason, opts?: ConsumeOpts): Promise<CreditLedgerEntry> {
    if (opts?.tx) return this.consumeInTx(opts.tx, tenantId, amountRaw, reason, opts);
    for (let attempt = 0; attempt < MAX_GRANT_RETRIES; attempt++) {
      try {
        return await this.prisma.$transaction((tx) => this.consumeInTx(tx, tenantId, amountRaw, reason, opts));
      } catch (e) {
        if (e instanceof ConflictException && attempt < MAX_GRANT_RETRIES - 1) continue;
        throw e;
      }
    }
    throw new ConflictException("Could not consume credits");
  }

  async consumeInTx(tx: Tx, tenantId: string, amountRaw: number | string | Prisma.Decimal, reason: CreditReason, opts?: ConsumeOpts): Promise<CreditLedgerEntry> {
    const amount = decimalAmount(amountRaw instanceof Prisma.Decimal ? amountRaw.toFixed(2) : amountRaw);
    if (amount.lte(0)) throw new BadRequestException("consume amount must be positive");
    this.assertNoPatientRefs(opts?.sourceRef, opts?.idempotencyKey);
    const use = opts?.untyped ? undefined : (opts?.use ?? USE_OF_REASON[reason]);
    const wallet = await this.ensureWallet(tenantId, tx);
    if (opts?.idempotencyKey) {
      const existing = await tx.creditLedgerEntry.findUnique({ where: { walletId_idempotencyKey: { walletId: wallet.id, idempotencyKey: opts.idempotencyKey } } });
      if (existing) return existing; // W-6 replay
    }
    if (wallet.balance.lt(amount)) throw new BadRequestException("Insufficient credit balance");

    const now = new Date();
    const grantRows = await tx.creditLedgerEntry.findMany({
      where: { walletId: wallet.id, type: CreditEntryType.GRANT, remaining: { gt: 0 } },
      orderBy: { createdAt: "asc" },
    });
    // a typed use only draws from unexpired lots whose category (and restrictions) allow it; a legacy untyped consume behaves as before
    const eligible = use ? grantRows.filter((r) => (!r.expiresAt || r.expiresAt.getTime() > now.getTime()) && lotSpendableFor(r, use)) : grantRows;
    const lots = grantLotsFromEntries(eligible.map((r) => ({ type: r.type, reason: r.reason, amount: r.amount, remaining: r.remaining, expiresAt: r.expiresAt })));
    const spendable = lots.reduce((s, l) => s.add(l.remaining), new Prisma.Decimal(0));
    if (spendable.lt(amount)) throw new BadRequestException("Insufficient credit balance");
    const allocations = allocateConsumeFifo(lots, amount);

    for (const alloc of allocations) {
      const row = eligible[alloc.entryIndex];
      await tx.creditLedgerEntry.update({ where: { id: row.id }, data: { remaining: (row.remaining ?? row.amount).sub(alloc.taken) } });
    }

    const updated = await tx.creditWallet.updateMany({
      where: { id: wallet.id, version: wallet.version },
      data: { balance: wallet.balance.sub(amount), version: { increment: 1 } },
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
        campaignRef: opts?.campaignRef ?? null,
        idempotencyKey: opts?.idempotencyKey ?? null,
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
          use: use ?? null,
          entryId: entry.id,
          invoiceId: opts?.invoiceId ?? null,
          lots: allocations.map((a) => ({ lot: eligible[a.entryIndex].id, taken: a.taken.toFixed(2) })),
        } as Prisma.InputJsonValue,
      },
    });
    await this.emitCredit(tx, "ProviderCreditConsumed", wallet, use ?? "UNTYPED", reason, amount);
    return entry;
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
      await this.emitCredit(tx, "ProviderCreditExpired", wallet, "EXPIRED_LOTS", "EXPIRED", totalExpired);

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
    category: row.category ?? null,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
  };
}