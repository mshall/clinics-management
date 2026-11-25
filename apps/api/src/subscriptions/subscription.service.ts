import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  BillingInterval,
  PlanKey,
  Prisma,
  SubscriptionStatus,
  type Subscription,
} from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { PrismaService } from "../prisma/prisma.service";
import { assertSubscriptionBillingAccess } from "./subscription-access";
import { addBillingPeriod } from "./subscription-period";
import { assertSubscriptionStatusTransition } from "./subscription-state";
import { ACTIVE_PRICE_WHERE } from "../plans/plans-active-prices";
import { assertEgyptPdpcPaidLaunchAllowed } from "../compliance/pdpc-egypt-launch-gate";
import { LegalAcceptanceService } from "../legal/legal-acceptance.service";
import { isPaidPlanKey } from "../legal/legal-catalog";
import { BillingSeatService } from "./billing-seat.service";
import { resolveMarketForTenant } from "../markets/market-resolver";
import { effectiveAutoRenew, subscriptionPolicyFromFeatureDefaults } from "./subscription-policy";
import {
  computePlanChangeProration,
  computeSeatChangeProration,
  isPlanUpgrade,
  periodAmountForSubscription,
  type PlanChangeProration,
  type PlanPriceShape,
} from "./subscription-proration";

type Tx = Prisma.TransactionClient;

export type PreviewChangeBody = {
  planKey: PlanKey;
  interval: BillingInterval;
  seats: number;
  timing?: "IMMEDIATE" | "PERIOD_END";
  activeClinicianUserIds?: string[];
};

export type SubscriptionView = {
  id: string;
  status: SubscriptionStatus;
  interval: BillingInterval;
  clinicianSeats: number;
  trialStartsAt: string | null;
  trialEndsAt: string | null;
  activatedAt: string | null;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  /** SUB-01: effective auto-renew (platform force wins). */
  autoRenew: boolean;
  downgradedToLiteAt: string | null;
  cohortKey: string | null;
  priceLockUntil: string | null;
  plan: { key: PlanKey; nameEn: string; nameAr: string };
  trialPlan: { key: PlanKey; nameEn: string; nameAr: string } | null;
  planPrice: {
    id: string;
    amount: string;
    currency: string;
    unit: string;
    includedClinicians: number;
    extraClinicianAmount: string | null;
  } | null;
  nextInvoicePreview: {
    currency: string;
    subtotal: string;
    description: string;
  } | null;
};

@Injectable()
export class SubscriptionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly legal: LegalAcceptanceService,
    private readonly billingSeats: BillingSeatService,
  ) {}

  private async loadSubscription(tenantId: string) {
    const sub = await this.prisma.subscription.findUnique({
      where: { tenantId },
      include: {
        plan: true,
        trialPlan: true,
        planPrice: true,
      },
    });
    if (!sub) throw new NotFoundException("Subscription not found");
    return sub;
  }

  private mapView(sub: Subscription & {
    plan: { key: PlanKey; nameEn: string; nameAr: string };
    trialPlan: { key: PlanKey; nameEn: string; nameAr: string } | null;
    planPrice: {
      id: string;
      amount: Prisma.Decimal;
      currency: string;
      unit: string;
      includedClinicians: number;
      extraClinicianAmount: Prisma.Decimal | null;
    } | null;
  }): SubscriptionView {
    const preview = this.buildInvoicePreview(sub);
    return {
      id: sub.id,
      status: sub.status,
      interval: sub.interval,
      clinicianSeats: sub.clinicianSeats,
      trialStartsAt: sub.trialStartsAt?.toISOString() ?? null,
      trialEndsAt: sub.trialEndsAt?.toISOString() ?? null,
      activatedAt: sub.activatedAt?.toISOString() ?? null,
      currentPeriodStart: sub.currentPeriodStart.toISOString(),
      currentPeriodEnd: sub.currentPeriodEnd.toISOString(),
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
      autoRenew: effectiveAutoRenew(sub),
      downgradedToLiteAt: sub.downgradedToLiteAt?.toISOString() ?? null,
      cohortKey: sub.cohortKey,
      priceLockUntil: sub.priceLockUntil?.toISOString() ?? null,
      plan: { key: sub.plan.key, nameEn: sub.plan.nameEn, nameAr: sub.plan.nameAr },
      trialPlan: sub.trialPlan
        ? { key: sub.trialPlan.key, nameEn: sub.trialPlan.nameEn, nameAr: sub.trialPlan.nameAr }
        : null,
      planPrice: sub.planPrice
        ? {
            id: sub.planPrice.id,
            amount: sub.planPrice.amount.toString(),
            currency: sub.planPrice.currency,
            unit: sub.planPrice.unit,
            includedClinicians: sub.planPrice.includedClinicians,
            extraClinicianAmount: sub.planPrice.extraClinicianAmount?.toString() ?? null,
          }
        : null,
      nextInvoicePreview: preview,
    };
  }

  private buildInvoicePreview(
    sub: Subscription & {
      planPrice: {
        amount: Prisma.Decimal;
        currency: string;
        unit: string;
        includedClinicians: number;
        extraClinicianAmount: Prisma.Decimal | null;
      } | null;
    },
  ): SubscriptionView["nextInvoicePreview"] {
    if (!sub.planPrice || sub.status === SubscriptionStatus.TRIALING) return null;
    const base = Number(sub.planPrice.amount);
    const extra =
      sub.planPrice.unit === "PER_CLINICIAN"
        ? base * sub.clinicianSeats
        : base +
          Math.max(0, sub.clinicianSeats - sub.planPrice.includedClinicians) *
            Number(sub.planPrice.extraClinicianAmount ?? 0);
    return {
      currency: sub.planPrice.currency,
      subtotal: extra.toFixed(2),
      description:
        sub.planPrice.unit === "PER_CLINICIAN"
          ? `${sub.clinicianSeats} clinician seat(s)`
          : `Organization plan (${sub.clinicianSeats} clinicians)`,
    };
  }

  async recordSubscriptionEvent(
    tx: Tx,
    subscriptionId: string,
    tenantId: string,
    type: string,
    fromJson: Record<string, unknown> | null,
    toJson: Record<string, unknown>,
    actorUserId: string | null,
    action: string,
  ): Promise<void> {
    await this.appendEvent(tx, subscriptionId, type, fromJson, toJson, actorUserId, tenantId, action);
  }

  async recordSubscriptionEventOutsideTx(
    subscriptionId: string,
    tenantId: string,
    type: string,
    fromJson: Record<string, unknown> | null,
    toJson: Record<string, unknown>,
    actorUserId: string | null,
    action: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.appendEvent(tx, subscriptionId, type, fromJson, toJson, actorUserId, tenantId, action);
    });
  }

  private async appendEvent(
    tx: Tx,
    subscriptionId: string,
    type: string,
    fromJson: Record<string, unknown> | null,
    toJson: Record<string, unknown>,
    actorUserId: string | null,
    tenantId: string,
    action: string,
  ) {
    await tx.subscriptionEvent.create({
      data: {
        subscriptionId,
        type,
        fromJson: fromJson ? (fromJson as Prisma.InputJsonValue) : undefined,
        toJson: toJson as Prisma.InputJsonValue,
        actorUserId,
      },
    });
    await tx.auditLog.create({
      data: {
        tenantId,
        actorId: actorUserId,
        clinicId: null,
        action,
        resource: "Subscription",
        resourceId: subscriptionId,
        metadata: { eventType: type, from: fromJson, to: toJson } as Prisma.InputJsonValue,
      },
    });
  }

  async getForTenant(user: JwtUser, tenantId: string): Promise<SubscriptionView> {
    if (user.tenantId !== tenantId) throw new ForbiddenException();
    assertSubscriptionBillingAccess(user);
    const sub = await this.loadSubscription(tenantId);
    return this.mapView(sub);
  }

  async transitionStatus(
    tenantId: string,
    to: SubscriptionStatus,
    actorUserId: string | null,
    reason: string,
  ): Promise<Subscription> {
    return this.prisma.$transaction(async (tx) => {
      const sub = await tx.subscription.findUnique({ where: { tenantId } });
      if (!sub) throw new NotFoundException("Subscription not found");
      assertSubscriptionStatusTransition(sub.status, to);
      const updated = await tx.subscription.update({
        where: { id: sub.id },
        data: { status: to },
      });
      await this.appendEvent(
        tx,
        sub.id,
        "status_changed",
        { status: sub.status, reason },
        { status: to, reason },
        actorUserId,
        tenantId,
        "subscription.status_changed",
      );
      return updated;
    });
  }

  async recordCreated(
    subscriptionId: string,
    tenantId: string,
    toJson: Record<string, unknown>,
    actorUserId: string | null,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.appendEvent(tx, subscriptionId, "created", null, toJson, actorUserId, tenantId, "subscription.created");
    });
  }

  async startTrial(
    tenantId: string,
    trialPlanId: string,
    trialEndsAt: Date,
    actorUserId: string | null,
  ): Promise<Subscription> {
    return this.prisma.$transaction(async (tx) => {
      const sub = await tx.subscription.findUnique({ where: { tenantId } });
      if (!sub) throw new NotFoundException("Subscription not found");
      const now = new Date();
      const updated = await tx.subscription.update({
        where: { id: sub.id },
        data: {
          status: SubscriptionStatus.TRIALING,
          trialStartsAt: now,
          trialEndsAt,
          trialPlanId,
        },
      });
      await this.appendEvent(
        tx,
        sub.id,
        "trial_started",
        { status: sub.status },
        { status: SubscriptionStatus.TRIALING, trialPlanId, trialEndsAt: trialEndsAt.toISOString() },
        actorUserId,
        tenantId,
        "subscription.trial_started",
      );
      return updated;
    });
  }

  async activateSubscription(tenantId: string, actorUserId: string | null): Promise<Subscription> {
    const subCheck = await this.prisma.subscription.findUnique({
      where: { tenantId },
      include: { plan: true },
    });
    if (!subCheck) throw new NotFoundException("Subscription not found");
    if (subCheck.status === SubscriptionStatus.TRIALING && isPaidPlanKey(subCheck.plan.key)) {
      const owner = await this.prisma.user.findFirst({
        where: { tenantId, isTenantOwner: true },
        select: { id: true },
      });
      if (owner) {
        await this.legal.assertPaidPlanForUser(owner.id, tenantId, subCheck.plan.key);
      }
      await assertEgyptPdpcPaidLaunchAllowed(this.prisma, tenantId);
    }
    return this.prisma.$transaction(async (tx) => {
      const sub = await tx.subscription.findUnique({ where: { tenantId } });
      if (!sub) throw new NotFoundException("Subscription not found");
      assertSubscriptionStatusTransition(sub.status, SubscriptionStatus.ACTIVE);
      const now = new Date();
      const updated = await tx.subscription.update({
        where: { id: sub.id },
        data: {
          status: SubscriptionStatus.ACTIVE,
          activatedAt: sub.activatedAt ?? now,
          trialEndsAt: null,
        },
      });
      await this.appendEvent(
        tx,
        sub.id,
        "status_changed",
        { status: sub.status },
        { status: SubscriptionStatus.ACTIVE, activatedAt: now.toISOString() },
        actorUserId,
        tenantId,
        "subscription.activated",
      );
      return updated;
    });
  }

  private async loadSubscriptionPolicy(tenantId: string) {
    try {
      const ctx = await resolveMarketForTenant(this.prisma, tenantId);
      return subscriptionPolicyFromFeatureDefaults(ctx.market.featureDefaults);
    } catch {
      return subscriptionPolicyFromFeatureDefaults(null);
    }
  }

  private toPriceShape(price: {
    amount: Prisma.Decimal;
    unit: PlanPriceShape["unit"];
    includedClinicians: number;
    extraClinicianAmount: Prisma.Decimal | null;
    interval: BillingInterval;
    currency: string;
  }): PlanPriceShape & { currency: string } {
    return {
      currency: price.currency,
      amount: Number(price.amount),
      unit: price.unit,
      includedClinicians: price.includedClinicians,
      extraClinicianAmount: price.extraClinicianAmount != null ? Number(price.extraClinicianAmount) : null,
      interval: price.interval,
    };
  }

  private async resolveActivePlanPrice(tenantId: string, planKey: PlanKey, interval: BillingInterval) {
    const plan = await this.prisma.plan.findUnique({ where: { key: planKey } });
    if (!plan) throw new BadRequestException("Unknown plan");
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { marketId: true },
    });
    if (!tenant?.marketId) throw new BadRequestException("Organization has no market");
    const price = await this.prisma.planPrice.findFirst({
      where: { planId: plan.id, marketId: tenant.marketId, interval, ...ACTIVE_PRICE_WHERE() },
      orderBy: { priceVersion: "desc" },
    });
    if (!price) throw new BadRequestException("No active price for plan in your market");
    return { plan, price };
  }

  async previewPlanChange(user: JwtUser, tenantId: string, body: PreviewChangeBody) {
    if (user.tenantId !== tenantId) throw new ForbiddenException();
    assertSubscriptionBillingAccess(user);
    const sub = await this.loadSubscription(tenantId);
    if (!sub.planPrice) throw new BadRequestException("Subscription has no plan price");
    const { plan, price } = await this.resolveActivePlanPrice(tenantId, body.planKey, body.interval);
    const seats = Math.max(1, body.seats);
    const now = new Date();
    const currentShape = this.toPriceShape(sub.planPrice);
    const nextShape = this.toPriceShape(price);
    const currentFull = periodAmountForSubscription({ price: currentShape, clinicianSeats: sub.clinicianSeats });
    const nextFull = periodAmountForSubscription({ price: nextShape, clinicianSeats: seats });
    const upgrade = isPlanUpgrade(sub.plan.key, body.planKey, currentFull, nextFull);
    // SUB-01: default timing comes from the market subscription policy (proration values are NEEDS_HUMAN, LG-SUB-3).
    const policy = await this.loadSubscriptionPolicy(tenantId);
    const timing =
      body.timing ?? (upgrade ? policy.proration.upgradeTiming : policy.proration.downgradeTiming);
    const proration: PlanChangeProration = computePlanChangeProration({
      currency: price.currency,
      periodStart: sub.currentPeriodStart,
      periodEnd: sub.currentPeriodEnd,
      now,
      currentPlanKey: sub.plan.key,
      currentPrice: currentShape,
      currentSeats: sub.clinicianSeats,
      nextPlanKey: body.planKey,
      nextPrice: nextShape,
      nextSeats: seats,
      timing,
    });
    return {
      planKey: body.planKey,
      interval: body.interval,
      seats,
      priceId: price.id,
      planId: plan.id,
      proration,
      requiresClinicianSelection:
        seats < sub.clinicianSeats &&
        (await this.billingSeats.listPhysicians(tenantId)).length > seats,
    };
  }

  async changePlan(user: JwtUser, tenantId: string, body: PreviewChangeBody & { confirm?: boolean }) {
    const previewPayload = await this.previewPlanChange(user, tenantId, body);
    if (!body.confirm) {
      return { preview: previewPayload, applied: false };
    }

    if (isPaidPlanKey(body.planKey)) {
      await this.legal.assertPaidPlanForUser(user.userId, tenantId, body.planKey);
      await assertEgyptPdpcPaidLaunchAllowed(this.prisma, tenantId);
    }

    const sub = await this.loadSubscription(tenantId);
    const timing = previewPayload.proration.timing;
    const seats = Math.max(1, body.seats);

    if (timing === "PERIOD_END") {
      const updated = await this.prisma.$transaction(async (tx) => {
        const row = await tx.subscription.update({
          where: { tenantId },
          data: {
            scheduledPlanId: previewPayload.planId,
            scheduledPlanPriceId: previewPayload.priceId,
            scheduledInterval: body.interval,
            scheduledClinicianSeats: seats,
            scheduledEffectiveAt: sub.currentPeriodEnd,
          },
        });
        await this.appendEvent(
          tx,
          row.id,
          "plan_change_scheduled",
          { planId: sub.planId, seats: sub.clinicianSeats },
          {
            scheduledPlanId: previewPayload.planId,
            scheduledSeats: seats,
            effectiveAt: sub.currentPeriodEnd.toISOString(),
          },
          user.userId,
          tenantId,
          "subscription.plan_change_scheduled",
        );
        return row;
      });
      const full = await this.loadSubscription(tenantId);
      return {
        preview: previewPayload,
        applied: true,
        scheduled: true,
        subscription: this.mapView({ ...updated, plan: full.plan, trialPlan: full.trialPlan, planPrice: full.planPrice }),
      };
    }

    const { plan, price } = await this.resolveActivePlanPrice(tenantId, body.planKey, body.interval);
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.subscription.update({
        where: { tenantId },
        data: {
          planId: plan.id,
          planPriceId: price.id,
          interval: body.interval,
          clinicianSeats: seats,
          scheduledPlanId: null,
          scheduledPlanPriceId: null,
          scheduledInterval: null,
          scheduledClinicianSeats: null,
          scheduledEffectiveAt: null,
        },
      });
      await this.appendEvent(
        tx,
        row.id,
        "plan_changed",
        {
          planId: sub.planId,
          planPriceId: sub.planPriceId,
          interval: sub.interval,
          clinicianSeats: sub.clinicianSeats,
        },
        {
          planId: plan.id,
          planPriceId: price.id,
          interval: body.interval,
          clinicianSeats: seats,
          proration: previewPayload.proration,
        },
        user.userId,
        tenantId,
        "subscription.plan_changed",
      );
      return row;
    });

    await this.billingSeats.reconcileToSeatCap(tenantId, seats, body.activeClinicianUserIds);

    return {
      preview: previewPayload,
      applied: true,
      scheduled: false,
      subscription: this.mapView({ ...updated, plan, trialPlan: sub.trialPlan, planPrice: price }),
    };
  }

  async previewSeatsChange(user: JwtUser, tenantId: string, seats: number) {
    if (user.tenantId !== tenantId) throw new ForbiddenException();
    assertSubscriptionBillingAccess(user);
    if (seats < 1) throw new BadRequestException("seats must be at least 1");
    const sub = await this.loadSubscription(tenantId);
    if (!sub.planPrice) throw new BadRequestException("Subscription has no plan price");
    const shape = this.toPriceShape(sub.planPrice);
    const now = new Date();
    const timing = seats > sub.clinicianSeats ? "IMMEDIATE" : "PERIOD_END";
    const proration = computeSeatChangeProration({
      currency: sub.planPrice.currency,
      periodStart: sub.currentPeriodStart,
      periodEnd: sub.currentPeriodEnd,
      now,
      price: shape,
      currentSeats: sub.clinicianSeats,
      nextSeats: seats,
      timing,
    });
    return { seats, proration, requiresClinicianSelection: seats < sub.clinicianSeats };
  }

  async changeSeats(user: JwtUser, tenantId: string, body: { seats: number; confirm?: boolean; activeClinicianUserIds?: string[] }) {
    if (user.tenantId !== tenantId) throw new ForbiddenException();
    assertSubscriptionBillingAccess(user);
    const preview = await this.previewSeatsChange(user, tenantId, body.seats);
    if (!body.confirm) return { preview, applied: false };

    const sub = await this.loadSubscription(tenantId);
    if (preview.proration.timing === "PERIOD_END") {
      const updated = await this.prisma.$transaction(async (tx) => {
        const row = await tx.subscription.update({
          where: { tenantId },
          data: {
            scheduledClinicianSeats: body.seats,
            scheduledEffectiveAt: sub.currentPeriodEnd,
          },
        });
        await this.appendEvent(
          tx,
          row.id,
          "seats_change_scheduled",
          { clinicianSeats: sub.clinicianSeats },
          { scheduledSeats: body.seats, effectiveAt: sub.currentPeriodEnd.toISOString() },
          user.userId,
          tenantId,
          "subscription.seats_change_scheduled",
        );
        return row;
      });
      const full = await this.loadSubscription(tenantId);
      return { preview, applied: true, scheduled: true, subscription: this.mapView({ ...updated, ...full }) };
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.subscription.update({
        where: { tenantId },
        data: { clinicianSeats: body.seats },
      });
      await this.appendEvent(
        tx,
        row.id,
        "seats_changed",
        { clinicianSeats: sub.clinicianSeats },
        { clinicianSeats: body.seats, proration: preview.proration },
        user.userId,
        tenantId,
        "subscription.seats_changed",
      );
      return row;
    });
    await this.billingSeats.reconcileToSeatCap(tenantId, body.seats, body.activeClinicianUserIds);
    const full = await this.loadSubscription(tenantId);
    return { preview, applied: true, scheduled: false, subscription: this.mapView({ ...updated, ...full }) };
  }

  async applyScheduledSubscriptionChanges(tenantId: string, actorUserId: string | null): Promise<boolean> {
    const sub = await this.prisma.subscription.findUnique({
      where: { tenantId },
      include: { plan: true, planPrice: true },
    });
    if (!sub?.scheduledEffectiveAt || sub.scheduledEffectiveAt > new Date()) return false;
    if (!sub.scheduledPlanId && sub.scheduledClinicianSeats == null) return false;

    const planId = sub.scheduledPlanId ?? sub.planId;
    const priceId = sub.scheduledPlanPriceId ?? sub.planPriceId;
    const interval = sub.scheduledInterval ?? sub.interval;
    const seats = sub.scheduledClinicianSeats ?? sub.clinicianSeats;

    await this.prisma.$transaction(async (tx) => {
      await tx.subscription.update({
        where: { tenantId },
        data: {
          planId,
          planPriceId: priceId,
          interval,
          clinicianSeats: seats,
          scheduledPlanId: null,
          scheduledPlanPriceId: null,
          scheduledInterval: null,
          scheduledClinicianSeats: null,
          scheduledEffectiveAt: null,
        },
      });
      await this.appendEvent(
        tx,
        sub.id,
        "scheduled_change_applied",
        { planId: sub.planId, clinicianSeats: sub.clinicianSeats },
        { planId, clinicianSeats: seats },
        actorUserId,
        tenantId,
        "subscription.scheduled_change_applied",
      );
    });
    await this.billingSeats.reconcileToSeatCap(tenantId, seats);
    return true;
  }

  async requestCancelAtPeriodEnd(
    user: JwtUser,
    tenantId: string,
    atPeriodEnd: boolean,
  ): Promise<SubscriptionView> {
    if (user.tenantId !== tenantId) throw new ForbiddenException();
    assertSubscriptionBillingAccess(user);
    if (!atPeriodEnd) throw new BadRequestException("Only end-of-period cancellation is supported");

    const sub = await this.prisma.$transaction(async (tx) => {
      const row = await tx.subscription.findUnique({ where: { tenantId } });
      if (!row) throw new NotFoundException("Subscription not found");
      const updated = await tx.subscription.update({
        where: { id: row.id },
        data: { cancelAtPeriodEnd: true, autoRenew: false, autoRenewChangedAt: new Date(), autoRenewChangedBy: user.userId },
      });
      await this.appendEvent(
        tx,
        row.id,
        "cancelled",
        { cancelAtPeriodEnd: row.cancelAtPeriodEnd },
        { cancelAtPeriodEnd: true, effectiveAt: row.currentPeriodEnd.toISOString() },
        user.userId,
        tenantId,
        "subscription.cancel_scheduled",
      );
      return updated;
    });

    const full = await this.loadSubscription(tenantId);
    return this.mapView({ ...sub, plan: full.plan, trialPlan: full.trialPlan, planPrice: full.planPrice });
  }

  async completeCancellationAtPeriodEnd(
    tenantId: string,
    actorUserId: string | null,
    now: Date = new Date(),
  ): Promise<Subscription | null> {
    const sub = await this.prisma.subscription.findUnique({ where: { tenantId } });
    if (!sub || !sub.cancelAtPeriodEnd || sub.currentPeriodEnd > now) return null;
    return this.transitionStatus(
      tenantId,
      SubscriptionStatus.CANCELLED,
      actorUserId,
      "period_end_cancellation",
    );
  }

  async rollBillingPeriod(tenantId: string, actorUserId: string | null): Promise<Subscription | null> {
    const sub = await this.prisma.subscription.findUnique({ where: { tenantId } });
    if (!sub) return null;
    if (sub.status === SubscriptionStatus.CANCELLED || sub.status === SubscriptionStatus.TRIALING) return null;
    const now = new Date();
    if (sub.currentPeriodEnd > now) return null;

    const nextStart = sub.currentPeriodEnd;
    const nextEnd = addBillingPeriod(nextStart, sub.interval);

    await this.applyScheduledSubscriptionChanges(tenantId, actorUserId);

    return this.prisma.$transaction(async (tx) => {
      // SUB-01: optimistic lock on the period being rolled, so concurrent scheduler runs roll exactly once.
      const moved = await tx.subscription.updateMany({
        where: { id: sub.id, currentPeriodEnd: sub.currentPeriodEnd },
        data: {
          currentPeriodStart: nextStart,
          currentPeriodEnd: nextEnd,
        },
      });
      if (moved.count === 0) return null;
      const updated = await tx.subscription.findUniqueOrThrow({ where: { id: sub.id } });
      await this.appendEvent(
        tx,
        sub.id,
        "period_rolled",
        { currentPeriodStart: sub.currentPeriodStart.toISOString(), currentPeriodEnd: sub.currentPeriodEnd.toISOString() },
        { currentPeriodStart: nextStart.toISOString(), currentPeriodEnd: nextEnd.toISOString() },
        actorUserId,
        tenantId,
        "subscription.period_rolled",
      );
      return updated;
    });
  }

  async recordTrialEndingNotice(
    subscriptionId: string,
    tenantId: string,
    trialEndsAt: Date,
    daysBeforeEnd?: number,
  ): Promise<boolean> {
    const notices = await this.prisma.subscriptionEvent.findMany({
      where: { subscriptionId, type: "trial_ending_notice" },
      take: 50,
      orderBy: { createdAt: "desc" },
    });
    const iso = trialEndsAt.toISOString();
    const thresholdKey = daysBeforeEnd != null ? `${iso}:${daysBeforeEnd}` : iso;
    if (
      notices.some((n) => {
        const t = n.toJson as { trialEndsAt?: string; daysBeforeEnd?: number } | null;
        if (!t?.trialEndsAt) return false;
        if (daysBeforeEnd != null) {
          return t.trialEndsAt === iso && t.daysBeforeEnd === daysBeforeEnd;
        }
        return t.trialEndsAt === iso;
      })
    ) {
      return false;
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.subscriptionEvent.create({
        data: {
          subscriptionId,
          type: "trial_ending_notice",
          toJson: {
            trialEndsAt: trialEndsAt.toISOString(),
            ...(daysBeforeEnd != null ? { daysBeforeEnd } : {}),
          },
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId,
          actorId: null,
          clinicId: null,
          action: "subscription.trial_ending_notice",
          resource: "Subscription",
          resourceId: subscriptionId,
          metadata: { trialEndsAt: trialEndsAt.toISOString(), daysBeforeEnd, thresholdKey },
        },
      });
    });
    return true;
  }

  /** System-only dunning step (SB-03 stub). */
  async transitionToPastDue(tenantId: string): Promise<Subscription | null> {
    const sub = await this.prisma.subscription.findUnique({ where: { tenantId } });
    if (!sub || sub.status !== SubscriptionStatus.ACTIVE) return null;
    if (sub.kiorlyDunningPausedUntil && sub.kiorlyDunningPausedUntil > new Date()) {
      return null;
    }
    return this.transitionStatus(tenantId, SubscriptionStatus.PAST_DUE, null, "dunning");
  }
}