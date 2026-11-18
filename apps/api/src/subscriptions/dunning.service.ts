import { ForbiddenException, Injectable, Logger } from "@nestjs/common";
import {
  KiorlyInvoiceStatus,
  PlanKey,
  Prisma,
  SubscriptionStatus,
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { resolveMarketForTenant } from "../markets/market-resolver";
import { isKiorlyDunningPaused } from "../billing-platform/kiorly-dunning";
import { dunningTimelineFromFeatureDefaults } from "./dunning-config";
import { daysAfterDue, daysBeforeDue, resolveDunningPhase, subscriptionStatusForDaysOverdue } from "./dunning-timeline";
import {
  kiorexMarketplacePaused,
  subscriptionAllowsAction,
  SubscriptionAccessAction,
} from "./subscription-access-policy";
import { SubscriptionService } from "./subscription.service";
import { MarketplaceListingService } from "../marketplace/marketplace-listing.service";

const UNPAID_INVOICE_STATUSES = [KiorlyInvoiceStatus.ISSUED, KiorlyInvoiceStatus.PARTIALLY_PAID] as const;

@Injectable()
export class DunningService {
  private readonly log = new Logger(DunningService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptions: SubscriptionService,
    private readonly listings: MarketplaceListingService,
  ) {}

  async getAccessState(tenantId: string, user?: { isTenantOwner?: boolean; role?: string } | null) {
    const sub = await this.prisma.subscription.findUnique({
      where: { tenantId },
      include: { plan: { select: { key: true } } },
    });
    if (!sub) {
      return {
        status: SubscriptionStatus.ACTIVE,
        phase: "CURRENT" as const,
        marketplacePaused: false,
        allowedActions: Object.values(SubscriptionAccessAction),
        isOwner: Boolean(user?.isTenantOwner),
        daysOverdue: 0,
        banner: null as string | null,
      };
    }

    const pack = await this.loadDunningPack(tenantId);
    const anchor = await this.oldestUnpaidInvoiceDue(tenantId);
    const daysOverdue = anchor ? daysAfterDue(anchor, new Date()) : 0;
    const phase = anchor ? resolveDunningPhase(daysOverdue, pack) : "CURRENT";
    const litePause = await this.liteCommissionMarketplacePause(sub.plan.key, tenantId, pack.liteCommissionMarketplacePauseDays);

    const status = sub.status;
    const marketplacePaused = kiorexMarketplacePaused(status, litePause);
    const allowedActions = (Object.values(SubscriptionAccessAction) as SubscriptionAccessAction[]).filter((a) =>
      subscriptionAllowsAction(status, a, user as never),
    );

    return {
      status,
      phase,
      marketplacePaused,
      allowedActions,
      isOwner: Boolean(user?.isTenantOwner),
      daysOverdue,
      banner: this.bannerKey(status, phase, Boolean(user?.isTenantOwner)),
      liteCommissionPause: litePause,
    };
  }

  bannerKey(status: SubscriptionStatus, phase: string, isOwner: boolean): string | null {
    if (status === SubscriptionStatus.GRACE || status === SubscriptionStatus.PAST_DUE) {
      return isOwner ? "dunning.grace.owner" : "dunning.grace.staff";
    }
    if (status === SubscriptionStatus.READ_ONLY) {
      return isOwner ? "dunning.readOnly.owner" : "dunning.readOnly.staff";
    }
    if (status === SubscriptionStatus.SUSPENDED) {
      return isOwner ? "dunning.suspended.owner" : "dunning.suspended.staff";
    }
    if (phase === "REMINDER") return isOwner ? "dunning.reminder.owner" : "dunning.reminder.staff";
    return null;
  }

  async assertAccess(
    tenantId: string,
    user: Parameters<typeof subscriptionAllowsAction>[2],
    action: SubscriptionAccessAction,
  ): Promise<void> {
    const sub = await this.prisma.subscription.findUnique({ where: { tenantId } });
    const status = sub?.status ?? SubscriptionStatus.ACTIVE;
    if (!subscriptionAllowsAction(status, action, user)) {
      const code =
        status === SubscriptionStatus.SUSPENDED
          ? "SUBSCRIPTION_SUSPENDED"
          : status === SubscriptionStatus.READ_ONLY
            ? "SUBSCRIPTION_READ_ONLY"
            : "SUBSCRIPTION_ACCESS_DENIED";
      throw new ForbiddenException({
        code,
        message:
          status === SubscriptionStatus.SUSPENDED && !user?.isTenantOwner
            ? "Organization suspended — contact the clinic owner"
            : status === SubscriptionStatus.READ_ONLY && action !== SubscriptionAccessAction.BILLING
              ? "Subscription is read-only — contact the clinic owner to pay"
              : "This action is not allowed for the current subscription state",
      });
    }
  }

  /** Idempotent daily dunning pass for one tenant. */
  async runForTenant(tenantId: string, now = new Date()): Promise<boolean> {
    const sub = await this.prisma.subscription.findUnique({
      where: { tenantId },
      include: { plan: { select: { key: true } } },
    });
    if (!sub) return false;
    if (
      sub.status === SubscriptionStatus.TRIALING ||
      sub.status === SubscriptionStatus.CANCELLED
    ) {
      return false;
    }
    if (isKiorlyDunningPaused(sub, now)) return false;

    const pack = await this.loadDunningPack(tenantId);
    const anchor = await this.oldestUnpaidInvoiceDue(tenantId);

    if (!anchor) {
      if (
        sub.status === SubscriptionStatus.PAST_DUE ||
        sub.status === SubscriptionStatus.GRACE ||
        sub.status === SubscriptionStatus.READ_ONLY ||
        sub.status === SubscriptionStatus.SUSPENDED
      ) {
        await this.subscriptions.transitionStatus(tenantId, SubscriptionStatus.ACTIVE, null, "dunning_cleared");
        await this.listings.recomputeTenantListings(tenantId);
      }
      await this.syncKiorexBillingPause(tenantId, false);
      return true;
    }

    const isLite = sub.plan.key === PlanKey.LITE;
    const daysOverdue = daysAfterDue(anchor, now);
    // Lite pays commission only: unpaid fees pause the Kiorex listing, Kiorly itself keeps working.
    const target = isLite ? null : subscriptionStatusForDaysOverdue(daysOverdue, pack);
    if (target && target !== sub.status) {
      await this.applyDunningStatusSteps(tenantId, sub.status, target);
      await this.listings.recomputeTenantListings(tenantId);
    }

    await this.maybeSendReminders(tenantId, sub.id, anchor, pack, now);

    const litePause = await this.liteCommissionMarketplacePause(
      sub.plan.key,
      tenantId,
      pack.liteCommissionMarketplacePauseDays,
      now,
    );
    await this.syncKiorexBillingPause(tenantId, litePause);

    return true;
  }

  async runDaily(now = new Date()): Promise<{ processed: number }> {
    const subs = await this.prisma.subscription.findMany({
      where: {
        status: {
          in: [
            SubscriptionStatus.ACTIVE,
            SubscriptionStatus.PAST_DUE,
            SubscriptionStatus.GRACE,
            SubscriptionStatus.READ_ONLY,
            SubscriptionStatus.SUSPENDED,
          ],
        },
      },
      select: { tenantId: true },
    });
    let processed = 0;
    for (const row of subs) {
      try {
        if (await this.runForTenant(row.tenantId, now)) processed += 1;
      } catch (e) {
        this.log.warn(e instanceof Error ? e.message : String(e));
      }
    }
    return { processed };
  }

  /** Instant reactivation when SaaS balance is current (SB-03). */
  async reconcileAfterPayment(tenantId: string): Promise<void> {
    const anchor = await this.oldestUnpaidInvoiceDue(tenantId);
    if (anchor) return;
    const sub = await this.prisma.subscription.findUnique({ where: { tenantId } });
    if (!sub) return;
    if (
      sub.status === SubscriptionStatus.PAST_DUE ||
      sub.status === SubscriptionStatus.GRACE ||
      sub.status === SubscriptionStatus.READ_ONLY ||
      sub.status === SubscriptionStatus.SUSPENDED
    ) {
      await this.subscriptions.transitionStatus(tenantId, SubscriptionStatus.ACTIVE, null, "payment_received");
      await this.listings.recomputeTenantListings(tenantId);
    }
    await this.syncKiorexBillingPause(tenantId, false);
  }

  private readonly DUNNING_ESCALATION: SubscriptionStatus[] = [
    SubscriptionStatus.ACTIVE,
    SubscriptionStatus.PAST_DUE,
    SubscriptionStatus.GRACE,
    SubscriptionStatus.READ_ONLY,
    SubscriptionStatus.SUSPENDED,
  ];

  private async applyDunningStatusSteps(
    tenantId: string,
    from: SubscriptionStatus,
    target: SubscriptionStatus,
  ): Promise<void> {
    let current = from;
    const order = this.DUNNING_ESCALATION;
    const fromIdx = order.indexOf(current);
    const targetIdx = order.indexOf(target);
    if (fromIdx < 0 || targetIdx < 0) {
      await this.subscriptions.transitionStatus(tenantId, target, null, "dunning_timeline");
      return;
    }
    while (current !== target) {
      const curIdx = order.indexOf(current);
      const next =
        targetIdx > curIdx
          ? order[Math.min(curIdx + 1, order.length - 1)]
          : SubscriptionStatus.ACTIVE;
      if (next === current) break;
      await this.subscriptions.transitionStatus(tenantId, next, null, "dunning_timeline");
      current = next;
    }
  }

  async oldestUnpaidInvoiceDue(tenantId: string): Promise<Date | null> {
    const row = await this.prisma.kiorlyInvoice.findFirst({
      where: {
        tenantId,
        status: { in: [...UNPAID_INVOICE_STATUSES] },
        dueAt: { not: null },
        paymentUnderReview: false,
      },
      orderBy: { dueAt: "asc" },
      select: { dueAt: true, total: true, amountPaid: true },
    });
    if (!row?.dueAt) return null;
    if (row.total.sub(row.amountPaid).lte(0)) return null;
    return row.dueAt;
  }

  private async loadDunningPack(tenantId: string) {
    try {
      const ctx = await resolveMarketForTenant(this.prisma, tenantId);
      return dunningTimelineFromFeatureDefaults(ctx.market.featureDefaults);
    } catch {
      return dunningTimelineFromFeatureDefaults(null);
    }
  }

  private async liteCommissionMarketplacePause(
    planKey: PlanKey,
    tenantId: string,
    pauseAfterDays: number,
    now = new Date(),
  ): Promise<boolean> {
    if (planKey !== PlanKey.LITE) return false;
    const row = await this.prisma.kiorlyInvoice.findFirst({
      where: {
        tenantId,
        status: { in: [...UNPAID_INVOICE_STATUSES] },
        dueAt: { not: null },
        paymentUnderReview: false,
      },
      orderBy: { dueAt: "asc" },
      select: { dueAt: true, total: true, amountPaid: true },
    });
    if (!row?.dueAt || row.total.sub(row.amountPaid).lte(0)) return false;
    return daysAfterDue(row.dueAt, now) >= pauseAfterDays;
  }

  private async maybeSendReminders(
    tenantId: string,
    subscriptionId: string,
    dueAt: Date,
    pack: ReturnType<typeof dunningTimelineFromFeatureDefaults>,
    now: Date,
  ): Promise<void> {
    for (const offset of pack.reminderDaysBeforeDue) {
      const daysUntil = daysBeforeDue(dueAt, now);
      if (daysUntil !== offset) continue;
      const key = `dunning_reminder_d${offset}`;
      const existing = await this.prisma.subscriptionEvent.findFirst({
        where: { subscriptionId, type: key },
        orderBy: { createdAt: "desc" },
      });
      const marker = dueAt.toISOString().slice(0, 10);
      const toJson = existing?.toJson as { dueDate?: string } | null;
      if (toJson?.dueDate === marker) continue;

      await this.prisma.$transaction(async (tx) => {
        await tx.subscriptionEvent.create({
          data: {
            subscriptionId,
            type: key,
            toJson: { dueDate: marker, daysBeforeDue: offset } as Prisma.InputJsonValue,
          },
        });
        await tx.auditLog.create({
          data: {
            tenantId,
            actorId: null,
            clinicId: null,
            action: "subscription.dunning_reminder",
            resource: "Subscription",
            resourceId: subscriptionId,
            metadata: { daysBeforeDue: offset, dueDate: marker } as Prisma.InputJsonValue,
          },
        });
      });
    }
  }

  /** SB-05: set/clear the tenant Kiorex billing pause and re-evaluate listings when it flips. */
  private async syncKiorexBillingPause(tenantId: string, pause: boolean): Promise<void> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { kiorexBillingPausedAt: true },
    });
    if (!tenant) return;
    const isPaused = tenant.kiorexBillingPausedAt != null;
    if (isPaused === pause) return;
    await this.prisma.$transaction([
      this.prisma.tenant.update({
        where: { id: tenantId },
        data: { kiorexBillingPausedAt: pause ? new Date() : null },
      }),
      this.prisma.auditLog.create({
        data: {
          tenantId,
          actorId: null,
          action: pause ? "kiorex.listing.billing_paused" : "kiorex.listing.billing_resumed",
          resource: "Tenant",
          resourceId: tenantId,
          metadata: { reason: "lite_commission_unpaid" } as Prisma.InputJsonValue,
        },
      }),
    ]);
    await this.listings.recomputeTenantListings(tenantId);
  }
}