import { ForbiddenException, Injectable, Logger } from "@nestjs/common";
import {
  BillingInterval,
  PriceMigrationStatus,
  PriceUnit,
  Prisma,
  SubscriptionStatus,
  type PlanPrice,
} from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { isPlatformSuperAdmin } from "../common/platform-super-admin";
import { OutboxEventService, OUTBOX_TARGET_INTERNAL } from "../messaging/outbox-event.service";
import { PrismaService } from "../prisma/prisma.service";
import { roundMoney } from "../billing-platform/settlement-rounding";
import {
  PRICE_CHANGE_APPLIED_TOPIC,
  PRICE_CHANGE_NOTICE_TOPIC,
  bilingualPriceChangeNotice,
  canApplyPriceMigration,
  computePriceMigrationSchedule,
  monthlyAmountForPrice,
  priceChangeNoticeDaysFromFeatureDefaults,
  type PriceForIndexation,
} from "./price-indexation";

type Tx = Prisma.TransactionClient;

export type PriceSegment = {
  planId: string;
  marketId: string;
  interval: BillingInterval;
  unit: PriceUnit;
  cohortKey: string | null;
};

export type PriceImpactRow = {
  tenantId: string;
  tenantName: string;
  subscriptionId: string;
  fromPlanPriceId: string;
  fromMonthly: string;
  toMonthly: string;
  monthlyDelta: string;
  currency: string;
  effectiveAt: string;
  noticeDueAt: string;
  lockedUntil: string | null;
};

export type PriceImpactPreview = {
  noticeDays: number;
  currency: string;
  tenantsAffected: number;
  lockedTenants: number;
  mrrBefore: string;
  mrrAfter: string;
  mrrDelta: string;
  rows: PriceImpactRow[];
};

const PENDING_STATUSES = [PriceMigrationStatus.SCHEDULED, PriceMigrationStatus.NOTICE_SENT];

function toIndexationPrice(p: Pick<PlanPrice, "interval" | "unit" | "amount" | "includedClinicians" | "extraClinicianAmount">): PriceForIndexation {
  return {
    interval: p.interval,
    unit: p.unit,
    amount: Number(p.amount),
    includedClinicians: p.includedClinicians,
    extraClinicianAmount: p.extraClinicianAmount != null ? Number(p.extraClinicianAmount) : null,
  };
}

@Injectable()
export class PriceIndexationService {
  private readonly log = new Logger(PriceIndexationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxEventService,
  ) {}

  async noticeDaysForMarket(marketId: string, client: Pick<Tx, "market"> = this.prisma): Promise<number> {
    const market = await client.market.findUnique({ where: { id: marketId }, select: { featureDefaults: true } });
    return priceChangeNoticeDaysFromFeatureDefaults(market?.featureDefaults);
  }

  /** Live subscriptions on any other version of the same price segment. */
  private segmentSubscriptions(client: Pick<Tx, "subscription">, segment: PriceSegment, excludePriceId?: string) {
    return client.subscription.findMany({
      where: {
        status: { not: SubscriptionStatus.CANCELLED },
        planPrice: {
          planId: segment.planId,
          marketId: segment.marketId,
          interval: segment.interval,
          unit: segment.unit,
          cohortKey: segment.cohortKey,
          ...(excludePriceId ? { id: { not: excludePriceId } } : {}),
        },
      },
      include: { planPrice: true, tenant: { select: { name: true } } },
      orderBy: { currentPeriodEnd: "asc" },
    });
  }

  async previewImpact(
    segment: PriceSegment,
    draft: PriceForIndexation & { currency: string },
    opts: { now?: Date; notBefore?: Date; client?: Tx; excludePriceId?: string } = {},
  ): Promise<PriceImpactPreview> {
    const client = opts.client ?? this.prisma;
    const now = opts.now ?? new Date();
    const noticeDays = await this.noticeDaysForMarket(segment.marketId, client);
    const subs = await this.segmentSubscriptions(client, segment, opts.excludePriceId);

    let before = 0;
    let after = 0;
    let locked = 0;
    const rows: PriceImpactRow[] = [];
    for (const sub of subs) {
      if (!sub.planPrice) continue;
      const fromMonthly = monthlyAmountForPrice(toIndexationPrice(sub.planPrice), sub.clinicianSeats);
      const toMonthly = monthlyAmountForPrice(draft, sub.clinicianSeats);
      const schedule = computePriceMigrationSchedule({
        noticeFrom: now,
        noticeDays,
        notBefore: opts.notBefore,
        currentPeriodEnd: sub.currentPeriodEnd,
        interval: sub.interval,
        priceLockUntil: sub.priceLockUntil,
      });
      if (schedule.lockedUntil) locked += 1;
      before = roundMoney(before + fromMonthly);
      after = roundMoney(after + toMonthly);
      rows.push({
        tenantId: sub.tenantId,
        tenantName: sub.tenant.name,
        subscriptionId: sub.id,
        fromPlanPriceId: sub.planPrice.id,
        fromMonthly: fromMonthly.toFixed(2),
        toMonthly: toMonthly.toFixed(2),
        monthlyDelta: roundMoney(toMonthly - fromMonthly).toFixed(2),
        currency: sub.planPrice.currency,
        effectiveAt: schedule.effectiveAt.toISOString(),
        noticeDueAt: schedule.noticeDueAt.toISOString(),
        lockedUntil: schedule.lockedUntil?.toISOString() ?? null,
      });
    }
    return {
      noticeDays,
      currency: draft.currency,
      tenantsAffected: new Set(rows.map((r) => r.tenantId)).size,
      lockedTenants: locked,
      mrrBefore: before.toFixed(2),
      mrrAfter: after.toFixed(2),
      mrrDelta: roundMoney(after - before).toFixed(2),
      rows,
    };
  }

  /** Inside the publish transaction: one pending migration per affected subscription (older pending ones cancelled). */
  async scheduleForNewPrice(
    tx: Tx,
    segment: PriceSegment,
    newPrice: PlanPrice,
    opts: { now?: Date } = {},
  ): Promise<PriceImpactPreview> {
    const now = opts.now ?? new Date();
    const impact = await this.previewImpact(
      segment,
      { ...toIndexationPrice(newPrice), currency: newPrice.currency },
      { now, notBefore: newPrice.validFrom, client: tx, excludePriceId: newPrice.id },
    );
    for (const row of impact.rows) {
      await tx.planPriceMigration.updateMany({
        where: { subscriptionId: row.subscriptionId, status: { in: PENDING_STATUSES } },
        data: { status: PriceMigrationStatus.CANCELLED, cancelledReason: "superseded" },
      });
      await tx.planPriceMigration.create({
        data: {
          tenantId: row.tenantId,
          subscriptionId: row.subscriptionId,
          fromPlanPriceId: row.fromPlanPriceId,
          toPlanPriceId: newPrice.id,
          noticeDueAt: new Date(row.noticeDueAt),
          effectiveAt: new Date(row.effectiveAt),
          priceLockUntil: row.lockedUntil ? new Date(row.lockedUntil) : null,
          fromMonthlyAmount: new Prisma.Decimal(row.fromMonthly),
          toMonthlyAmount: new Prisma.Decimal(row.toMonthly),
          currency: row.currency,
        },
      });
    }
    return impact;
  }

  /** Sends bilingual notices (outbox) for migrations whose notice is due. */
  async sendDueNotices(now = new Date()): Promise<number> {
    const due = await this.prisma.planPriceMigration.findMany({
      where: { status: PriceMigrationStatus.SCHEDULED, noticeDueAt: { lte: now } },
      include: { toPlanPrice: { include: { plan: true } } },
      take: 500,
    });
    let sent = 0;
    for (const m of due) {
      const message = bilingualPriceChangeNotice({
        planNameEn: m.toPlanPrice.plan.nameEn,
        planNameAr: m.toPlanPrice.plan.nameAr,
        fromAmount: m.fromMonthlyAmount.toFixed(2),
        toAmount: m.toMonthlyAmount.toFixed(2),
        currency: m.currency,
        effectiveAt: m.effectiveAt,
      });
      await this.prisma.$transaction(async (tx) => {
        const claimed = await tx.planPriceMigration.updateMany({
          where: { id: m.id, status: PriceMigrationStatus.SCHEDULED },
          data: { status: PriceMigrationStatus.NOTICE_SENT, noticeSentAt: now },
        });
        if (claimed.count === 0) return;
        await this.outbox.enqueueEvent(
          {
            tenantId: m.tenantId,
            type: PRICE_CHANGE_NOTICE_TOPIC,
            aggregateType: "PlanPriceMigration",
            aggregateId: m.id,
            target: OUTBOX_TARGET_INTERNAL,
            payload: {
              migrationId: m.id,
              subscriptionId: m.subscriptionId,
              effectiveAt: m.effectiveAt.toISOString(),
              fromMonthlyAmount: m.fromMonthlyAmount.toFixed(2),
              toMonthlyAmount: m.toMonthlyAmount.toFixed(2),
              currency: m.currency,
              messageEn: message.en,
              messageAr: message.ar,
              audience: "tenant_owner",
            },
          },
          tx,
        );
        await tx.auditLog.create({
          data: {
            tenantId: m.tenantId,
            actorId: null,
            action: "subscription.price_change_notice",
            resource: "PlanPriceMigration",
            resourceId: m.id,
            metadata: {
              effectiveAt: m.effectiveAt.toISOString(),
              from: m.fromMonthlyAmount.toFixed(2),
              to: m.toMonthlyAmount.toFixed(2),
            } as Prisma.InputJsonValue,
          },
        });
        sent += 1;
      });
    }
    return sent;
  }

  /** Moves subscriptions whose effective renewal has arrived; re-checks price locks and notice. */
  async applyDue(now = new Date()): Promise<{ applied: number; rescheduled: number; cancelled: number }> {
    const due = await this.prisma.planPriceMigration.findMany({
      where: { status: PriceMigrationStatus.NOTICE_SENT, effectiveAt: { lte: now } },
      include: { subscription: true },
      take: 500,
    });
    let applied = 0;
    let rescheduled = 0;
    let cancelled = 0;
    for (const m of due) {
      const sub = m.subscription;
      if (
        sub.status === SubscriptionStatus.CANCELLED ||
        sub.cancelAtPeriodEnd ||
        sub.planPriceId !== m.fromPlanPriceId
      ) {
        await this.prisma.planPriceMigration.update({
          where: { id: m.id },
          data: {
            status: PriceMigrationStatus.CANCELLED,
            cancelledReason: sub.planPriceId !== m.fromPlanPriceId ? "plan_changed" : "subscription_cancelling",
          },
        });
        cancelled += 1;
        continue;
      }

      const noticeDays = await this.noticeDaysForMarket(
        (await this.prisma.planPrice.findUniqueOrThrow({ where: { id: m.toPlanPriceId }, select: { marketId: true } }))
          .marketId,
      );
      if (
        !canApplyPriceMigration({
          now,
          effectiveAt: m.effectiveAt,
          noticeSentAt: m.noticeSentAt,
          noticeDays,
          priceLockUntil: sub.priceLockUntil,
        })
      ) {
        const schedule = computePriceMigrationSchedule({
          noticeFrom: now,
          noticeDays,
          currentPeriodEnd: sub.currentPeriodEnd > now ? sub.currentPeriodEnd : m.effectiveAt,
          interval: sub.interval,
          priceLockUntil: sub.priceLockUntil,
        });
        await this.prisma.planPriceMigration.update({
          where: { id: m.id },
          data: {
            status: PriceMigrationStatus.SCHEDULED,
            noticeSentAt: null,
            effectiveAt: schedule.effectiveAt,
            noticeDueAt: schedule.noticeDueAt,
            priceLockUntil: schedule.lockedUntil,
          },
        });
        rescheduled += 1;
        continue;
      }

      await this.prisma.$transaction(async (tx) => {
        const claimed = await tx.planPriceMigration.updateMany({
          where: { id: m.id, status: PriceMigrationStatus.NOTICE_SENT },
          data: { status: PriceMigrationStatus.APPLIED, appliedAt: now, consentByContinuingAt: now },
        });
        if (claimed.count === 0) return;
        await tx.subscription.update({ where: { id: sub.id }, data: { planPriceId: m.toPlanPriceId } });
        await tx.subscriptionEvent.create({
          data: {
            subscriptionId: sub.id,
            type: "price_migrated",
            fromJson: { planPriceId: m.fromPlanPriceId, monthly: m.fromMonthlyAmount.toFixed(2) } as Prisma.InputJsonValue,
            toJson: {
              planPriceId: m.toPlanPriceId,
              monthly: m.toMonthlyAmount.toFixed(2),
              consentByContinuing: true,
              noticeSentAt: m.noticeSentAt?.toISOString() ?? null,
            } as Prisma.InputJsonValue,
          },
        });
        await tx.auditLog.create({
          data: {
            tenantId: m.tenantId,
            actorId: null,
            action: "subscription.price_migrated",
            resource: "Subscription",
            resourceId: sub.id,
            metadata: {
              migrationId: m.id,
              from: m.fromMonthlyAmount.toFixed(2),
              to: m.toMonthlyAmount.toFixed(2),
              currency: m.currency,
              consentByContinuing: true,
            } as Prisma.InputJsonValue,
          },
        });
        await this.outbox.enqueueEvent(
          {
            tenantId: m.tenantId,
            type: PRICE_CHANGE_APPLIED_TOPIC,
            aggregateType: "PlanPriceMigration",
            aggregateId: m.id,
            target: OUTBOX_TARGET_INTERNAL,
            payload: {
              migrationId: m.id,
              subscriptionId: sub.id,
              toPlanPriceId: m.toPlanPriceId,
              consentByContinuingAt: now.toISOString(),
            },
          },
          tx,
        );
        applied += 1;
      });
    }
    return { applied, rescheduled, cancelled };
  }

  async runDue(now = new Date()) {
    const notices = await this.sendDueNotices(now);
    const result = await this.applyDue(now);
    if (notices || result.applied || result.rescheduled) {
      this.log.log(
        `Price indexation: notices=${notices} applied=${result.applied} rescheduled=${result.rescheduled} cancelled=${result.cancelled}`,
      );
    }
    return { notices, ...result };
  }

  /** Platform report: who moves when. */
  async report(user: JwtUser, filters: { status?: string; planId?: string } = {}) {
    if (!isPlatformSuperAdmin(user)) {
      throw new ForbiddenException("Only platform super administrators can use this API");
    }
    const status = filters.status?.trim().toUpperCase();
    const statusFilter =
      status && (Object.values(PriceMigrationStatus) as string[]).includes(status)
        ? { status: status as PriceMigrationStatus }
        : { status: { in: PENDING_STATUSES } };
    const rows = await this.prisma.planPriceMigration.findMany({
      where: {
        ...statusFilter,
        ...(filters.planId ? { toPlanPrice: { planId: filters.planId } } : {}),
      },
      include: {
        tenant: { select: { name: true } },
        toPlanPrice: { select: { priceVersion: true, plan: { select: { key: true } } } },
        fromPlanPrice: { select: { priceVersion: true } },
      },
      orderBy: [{ effectiveAt: "asc" }],
      take: 1000,
    });
    return {
      items: rows.map((m) => ({
        id: m.id,
        tenantId: m.tenantId,
        tenantName: m.tenant.name,
        planKey: m.toPlanPrice.plan.key,
        fromVersion: m.fromPlanPrice.priceVersion,
        toVersion: m.toPlanPrice.priceVersion,
        fromMonthly: m.fromMonthlyAmount.toFixed(2),
        toMonthly: m.toMonthlyAmount.toFixed(2),
        currency: m.currency,
        status: m.status,
        noticeDueAt: m.noticeDueAt.toISOString(),
        noticeSentAt: m.noticeSentAt?.toISOString() ?? null,
        effectiveAt: m.effectiveAt.toISOString(),
        priceLockUntil: m.priceLockUntil?.toISOString() ?? null,
        appliedAt: m.appliedAt?.toISOString() ?? null,
        consentByContinuingAt: m.consentByContinuingAt?.toISOString() ?? null,
      })),
    };
  }
}
