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
import { LegalAcceptanceService } from "../legal/legal-acceptance.service";
import { isPaidPlanKey } from "../legal/legal-catalog";

type Tx = Prisma.TransactionClient;

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

  async changePlan(
    user: JwtUser,
    tenantId: string,
    body: {
      planKey: PlanKey;
      interval: BillingInterval;
      seats: number;
      confirm?: boolean;
    },
  ) {
    if (user.tenantId !== tenantId) throw new ForbiddenException();
    assertSubscriptionBillingAccess(user);

    const plan = await this.prisma.plan.findUnique({ where: { key: body.planKey } });
    if (!plan) throw new BadRequestException("Unknown plan");

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { marketId: true },
    });
    if (!tenant?.marketId) throw new BadRequestException("Organization has no market");

    const price = await this.prisma.planPrice.findFirst({
      where: {
        planId: plan.id,
        marketId: tenant.marketId,
        interval: body.interval,
        ...ACTIVE_PRICE_WHERE(),
      },
      orderBy: { priceVersion: "desc" },
    });
    if (!price) throw new BadRequestException("No active price for plan in your market");

    const sub = await this.loadSubscription(tenantId);
    const preview = {
      planKey: body.planKey,
      interval: body.interval,
      seats: body.seats,
      priceId: price.id,
      amount: price.amount.toString(),
      currency: price.currency,
      effectiveAt: sub.currentPeriodEnd.toISOString(),
    };

    if (!body.confirm) {
      return { preview, applied: false };
    }

    if (isPaidPlanKey(body.planKey)) {
      await this.legal.assertPaidPlanForUser(user.userId, tenantId, body.planKey);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.subscription.update({
        where: { tenantId },
        data: {
          planId: plan.id,
          planPriceId: price.id,
          interval: body.interval,
          clinicianSeats: Math.max(1, body.seats),
        },
      });
      await this.appendEvent(
        tx,
        row.id,
        "plan_changed",
        { planId: sub.planId, planPriceId: sub.planPriceId, interval: sub.interval },
        { planId: plan.id, planPriceId: price.id, interval: body.interval },
        user.userId,
        tenantId,
        "subscription.plan_changed",
      );
      return row;
    });

    return { preview, applied: true, subscription: this.mapView({ ...updated, plan, trialPlan: sub.trialPlan, planPrice: price }) };
  }

  async changeSeats(
    tenantId: string,
    seats: number,
    actorUserId: string | null,
  ): Promise<Subscription> {
    if (seats < 1) throw new BadRequestException("seats must be at least 1");
    return this.prisma.$transaction(async (tx) => {
      const sub = await tx.subscription.findUnique({ where: { tenantId } });
      if (!sub) throw new NotFoundException("Subscription not found");
      const updated = await tx.subscription.update({
        where: { id: sub.id },
        data: { clinicianSeats: seats },
      });
      await this.appendEvent(
        tx,
        sub.id,
        "seats_changed",
        { clinicianSeats: sub.clinicianSeats },
        { clinicianSeats: seats },
        actorUserId,
        tenantId,
        "subscription.seats_changed",
      );
      return updated;
    });
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
        data: { cancelAtPeriodEnd: true },
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

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.subscription.update({
        where: { id: sub.id },
        data: {
          currentPeriodStart: nextStart,
          currentPeriodEnd: nextEnd,
        },
      });
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