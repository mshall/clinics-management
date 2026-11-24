import { BadRequestException, ConflictException, Injectable, Logger, Optional } from "@nestjs/common";
import { CreditReason, Prisma, type CreditReservation } from "@prisma/client";
import { FeatureFlagsService, requireFeature } from "../feature-flags/feature-flags-public";
import { PrismaService } from "../prisma/prisma.service";
import { namesPatientLedgerObject } from "./credit-categories";
import { spendableForUse } from "./credit-wallet-math";
import { CreditWalletService } from "./credit-wallet.service";

const MAX_RETRIES = 5;
type Tx = Prisma.TransactionClient;

export type HoldView = { id: string; state: CreditReservation["state"]; amount: string; debitedAmount: string | null; shortfall: string | null; promotionRef: string; holdRef: string };
const view = (r: CreditReservation): HoldView => ({ id: r.id, state: r.state, amount: r.amount.toFixed(2), debitedAmount: r.debitedAmount?.toFixed(2) ?? null, shortfall: r.shortfall?.toFixed(2) ?? null, promotionRef: r.promotionRef, holdRef: r.holdRef });

/**
 * GRW-P2-W, the provider side of provider-sponsored patient promotions (ADR-048, KX-30 14.4): reserve at booking, debit at completion,
 * release on cancel, reverse after a refund. The patient never touches this ledger and no balance is converted: the clinic's own promotional credit
 * pays a discount the patient sees as a "sponsored by the clinic" line. References are opaque (`promotionRef`, `holdRef` = the booking hold id of the
 * Kiorex booking intent): no patient id, no patient-ledger id (W-1, W-8). The promotion engine itself (rules, budget caps, review) is GRW-P2-S.
 */
@Injectable()
export class CreditPromotionHoldService {
  private readonly log = new Logger(CreditPromotionHoldService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: CreditWalletService,
    @Optional() private readonly flags?: FeatureFlagsService,
  ) {}

  private async gate(tenantId: string) {
    if (this.flags) await requireFeature(this.flags, tenantId, "clinic.provider_credit_v2");
  }

  private async retry<T>(fn: () => Promise<T>): Promise<T> {
    for (let i = 0; ; i++) {
      try { return await fn(); } catch (e) { if (e instanceof ConflictException && i < MAX_RETRIES - 1) continue; throw e; }
    }
  }

  private assertRefs(...refs: string[]) {
    for (const r of refs) {
      if (!r || r.length > 120) throw new BadRequestException("invalid reference");
      if (namesPatientLedgerObject(r)) throw new BadRequestException("references must not name a patient ledger object");
    }
  }

  /** Credit that can still back a new promotion: spendable on PROMOTIONS now, minus the budget already held. */
  async available(tenantId: string, tx: Tx = this.prisma): Promise<{ spendable: Prisma.Decimal; reserved: Prisma.Decimal; available: Prisma.Decimal }> {
    const wallet = await this.wallet.ensureWallet(tenantId, tx);
    const lots = await this.wallet.listLots(tenantId, tx);
    const spendable = spendableForUse(lots, "PROMOTIONS", new Date());
    const agg = await tx.creditReservation.aggregate({ where: { walletId: wallet.id, state: "RESERVED" }, _sum: { amount: true } });
    const reserved = agg._sum.amount ?? new Prisma.Decimal(0);
    return { spendable, reserved, available: Prisma.Decimal.max(spendable.sub(reserved), new Prisma.Decimal(0)) };
  }

  /** Reserve budget at booking time. Replay-safe on (promotionRef, holdRef). Fails when the clinic's promotion credit cannot cover it. */
  async reserve(tenantId: string, i: { promotionRef: string; holdRef: string; amount: number | string }): Promise<HoldView> {
    await this.gate(tenantId);
    this.assertRefs(i.promotionRef, i.holdRef);
    const amount = new Prisma.Decimal(String(i.amount));
    if (amount.lte(0)) throw new BadRequestException("amount must be positive");
    const key = `reserve:${i.promotionRef}:${i.holdRef}`;
    return this.retry(() => this.prisma.$transaction(async (tx) => {
      const wallet = await this.wallet.ensureWallet(tenantId, tx);
      const existing = await tx.creditReservation.findUnique({ where: { walletId_idempotencyKey: { walletId: wallet.id, idempotencyKey: key } } });
      if (existing) return view(existing);
      const av = await this.available(tenantId, tx);
      if (av.available.lt(amount)) throw new BadRequestException({ code: "PROMOTION_CREDIT_INSUFFICIENT", message: "Not enough promotion credit to hold this discount", available: av.available.toFixed(2) });
      // serialise concurrent reservations on the wallet version (same optimistic lock as grants and consumes)
      const bumped = await tx.creditWallet.updateMany({ where: { id: wallet.id, version: wallet.version }, data: { version: { increment: 1 } } });
      if (bumped.count !== 1) throw new ConflictException("wallet version conflict");
      const row = await tx.creditReservation.create({ data: { walletId: wallet.id, tenantId, amount, idempotencyKey: key, promotionRef: i.promotionRef, holdRef: i.holdRef } });
      await tx.auditLog.create({ data: { tenantId, action: "credit.promotion_reserved", resource: "CreditReservation", resourceId: row.id, metadata: { promotionRef: i.promotionRef, holdRef: i.holdRef, amount: amount.toFixed(2) } as Prisma.InputJsonValue } });
      return view(row);
    }));
  }

  private async find(tx: Tx, tenantId: string, promotionRef: string, holdRef: string) {
    const wallet = await this.wallet.ensureWallet(tenantId, tx);
    return tx.creditReservation.findUnique({ where: { walletId_idempotencyKey: { walletId: wallet.id, idempotencyKey: `reserve:${promotionRef}:${holdRef}` } } });
  }

  /** Release an unspent hold (booking cancelled or expired before the visit). Idempotent. */
  async release(tenantId: string, i: { promotionRef: string; holdRef: string }): Promise<HoldView | null> {
    await this.gate(tenantId);
    return this.retry(() => this.prisma.$transaction(async (tx) => {
      const r = await this.find(tx, tenantId, i.promotionRef, i.holdRef);
      if (!r) return null;
      if (r.state !== "RESERVED") return view(r);
      const done = await tx.creditReservation.update({ where: { id: r.id }, data: { state: "RELEASED", settledAt: new Date() } });
      await tx.auditLog.create({ data: { tenantId, action: "credit.promotion_released", resource: "CreditReservation", resourceId: r.id, metadata: { promotionRef: i.promotionRef, holdRef: i.holdRef } as Prisma.InputJsonValue } });
      return view(done);
    }));
  }

  /**
   * Debit at completion (attendance evidence is the caller's duty, GRW-P2-S): consumes the clinic's credit once, reason SPONSORED_PROMOTION.
   * If lots expired or were used meanwhile the debit takes what is spendable and records the shortfall for the invoice line "promotion expense".
   */
  async debit(tenantId: string, i: { promotionRef: string; holdRef: string }): Promise<HoldView> {
    await this.gate(tenantId);
    return this.retry(() => this.prisma.$transaction(async (tx) => {
      const r = await this.find(tx, tenantId, i.promotionRef, i.holdRef);
      if (!r) throw new BadRequestException({ code: "RESERVATION_NOT_FOUND", message: "No reservation for this booking" });
      if (r.state === "DEBITED") return view(r);
      if (r.state !== "RESERVED") throw new ConflictException({ code: "RESERVATION_NOT_DEBITABLE", state: r.state });
      const lots = await this.wallet.listLots(tenantId, tx);
      const wallet = await this.wallet.ensureWallet(tenantId, tx);
      const spendable = Prisma.Decimal.min(spendableForUse(lots, "PROMOTIONS", new Date()), wallet.balance);
      const take = Prisma.Decimal.min(r.amount, spendable);
      let entryId: string | null = null;
      if (take.gt(0)) {
        const e = await this.wallet.consumeInTx(tx, tenantId, take, CreditReason.SPONSORED_PROMOTION, {
          use: "PROMOTIONS", idempotencyKey: `debit:${i.promotionRef}:${i.holdRef}`, sourceRef: `promotion:${i.promotionRef}`, campaignRef: i.promotionRef,
          note: "Provider-sponsored patient discount (promotion expense)",
        });
        entryId = e.id;
      }
      const done = await tx.creditReservation.update({ where: { id: r.id }, data: { state: "DEBITED", settledAt: new Date(), debitedAmount: take, shortfall: r.amount.sub(take), debitEntryId: entryId } });
      return view(done);
    }));
  }

  /**
   * After a debit, a refund or cancellation hands the sponsored amount back to the clinic as credit (reason SPONSORED_PROMOTION_REVERSAL, once);
   * an undebited hold is simply released. Never pays the patient.
   */
  async reverse(tenantId: string, i: { promotionRef: string; holdRef: string }): Promise<HoldView | null> {
    await this.gate(tenantId);
    return this.retry(() => this.prisma.$transaction(async (tx) => {
      const r = await this.find(tx, tenantId, i.promotionRef, i.holdRef);
      if (!r) return null;
      if (r.state === "RESERVED") {
        const done = await tx.creditReservation.update({ where: { id: r.id }, data: { state: "RELEASED", settledAt: new Date() } });
        return view(done);
      }
      if (r.state !== "DEBITED") return view(r);
      let reversalId: string | null = null;
      if (r.debitedAmount && r.debitedAmount.gt(0)) {
        const g = await this.wallet.grantInTransaction({
          tenantId, amount: r.debitedAmount, reason: CreditReason.SPONSORED_PROMOTION_REVERSAL, tx,
          idempotencyKey: `promo-reversal:${i.promotionRef}:${i.holdRef}`, sourceRef: `promotion:${i.promotionRef}`, campaignRef: i.promotionRef,
          note: "Sponsored discount reversed (cancelled or refunded visit)",
        });
        reversalId = g.id;
      }
      const done = await tx.creditReservation.update({ where: { id: r.id }, data: { state: "REVERSED", settledAt: new Date(), reversalEntryId: reversalId } });
      return view(done);
    }));
  }
}
