import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import {
  AppointmentStatus,
  MessageChannel,
  PlanKey,
  Prisma,
  SubscriptionStatus,
  type Subscription,
} from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { PrismaService } from "../prisma/prisma.service";
import { SubscriptionService } from "./subscription.service";
import {
  cohortTrialDaysFromMarket,
  foundingTrialEndsAt,
  initialTrialEndsAt,
  resolveTrialConfig,
  standardTrialEndsAt,
  type TrialConfigOverride,
} from "./trial-config";
import { countQualifyingTrialVisits, trialActivationProgress } from "./trial-activation";
import { BadRequestException, ForbiddenException } from "@nestjs/common";

const MS_DAY = 86_400_000;

export type TrialStatusView = {
  endsAt: string | null;
  daysLeft: number | null;
  activated: boolean;
  activationProgress: { current: number; required: number };
  status: SubscriptionStatus;
  commissionPolicy: string;
};

type SubRow = Subscription & {
  tenant: { market: { featureDefaults: Prisma.JsonValue } | null };
};

@Injectable()
export class TrialEngineService {
  private readonly log = new Logger(TrialEngineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptions: SubscriptionService,
  ) {}

  private async loadSub(tenantId: string): Promise<SubRow> {
    const sub = await this.prisma.subscription.findUnique({
      where: { tenantId },
      include: { tenant: { include: { market: true } } },
    });
    if (!sub) throw new NotFoundException("Subscription not found");
    return sub as SubRow;
  }

  configFor(sub: SubRow) {
    const override =
      sub.trialConfigOverride && typeof sub.trialConfigOverride === "object" && !Array.isArray(sub.trialConfigOverride)
        ? (sub.trialConfigOverride as TrialConfigOverride)
        : null;
    return resolveTrialConfig({
      marketFeatureDefaults: sub.tenant.market?.featureDefaults,
      cohortKey: sub.cohortKey,
      override,
    });
  }

  async getTrialStatus(user: JwtUser, tenantId: string): Promise<TrialStatusView> {
    if (user.tenantId !== tenantId) throw new ForbiddenException();
    return this.getTrialStatusForTenant(tenantId);
  }

  async getTrialStatusForTenant(tenantId: string): Promise<TrialStatusView> {
    const sub = await this.loadSub(tenantId);
    const config = this.configFor(sub);
    const now = new Date();

    if (
      sub.status !== SubscriptionStatus.TRIALING &&
      sub.status !== SubscriptionStatus.GRACE &&
      !sub.trialEndsAt
    ) {
      return {
        endsAt: null,
        daysLeft: null,
        activated: Boolean(sub.trialQualifiedAt),
        activationProgress: { current: 0, required: config.minQualifyingVisits },
        status: sub.status,
        commissionPolicy: config.commissionPolicy,
      };
    }

    const visitCount =
      sub.trialStartsAt != null
        ? await countQualifyingTrialVisits(this.prisma, tenantId, sub.trialStartsAt, config)
        : 0;
    const progress = trialActivationProgress(visitCount, config);

    const endsAt = sub.trialEndsAt ?? (sub.postTrialGraceUntil && sub.status === SubscriptionStatus.GRACE ? sub.postTrialGraceUntil : null);
    const daysLeft =
      endsAt != null ? Math.max(0, Math.ceil((endsAt.getTime() - now.getTime()) / MS_DAY)) : null;

    return {
      endsAt: endsAt?.toISOString() ?? null,
      daysLeft,
      activated: Boolean(sub.trialQualifiedAt ?? progress.qualified),
      activationProgress: { current: progress.current, required: progress.required },
      status: sub.status,
      commissionPolicy: config.commissionPolicy,
    };
  }

  /** Call after a qualifying appointment check-in or completion. */
  async onQualifyingVisit(tenantId: string): Promise<void> {
    const sub = await this.loadSub(tenantId);
    if (sub.status !== SubscriptionStatus.TRIALING || !sub.trialStartsAt) return;
    const config = this.configFor(sub);
    const count = await countQualifyingTrialVisits(this.prisma, tenantId, sub.trialStartsAt, config);
    const { qualified } = trialActivationProgress(count, config);
    if (!qualified || sub.trialQualifiedAt) return;

    const now = new Date();
    const foundingEnd = foundingTrialEndsAt(sub.trialStartsAt, config);
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.subscription.update({
        where: { id: sub.id },
        data: {
          trialQualifiedAt: now,
          trialEndsAt: foundingEnd,
        },
      });
      await this.subscriptions.recordSubscriptionEvent(
        tx,
        sub.id,
        tenantId,
        "trial_qualified",
        { trialQualifiedAt: sub.trialQualifiedAt?.toISOString() ?? null, trialEndsAt: sub.trialEndsAt?.toISOString() ?? null },
        {
          trialQualifiedAt: now.toISOString(),
          trialEndsAt: foundingEnd.toISOString(),
          qualifyingVisits: count,
        },
        null,
        "subscription.trial_qualified",
      );
      void updated;
    });
  }

  async runDailyForSubscription(sub: SubRow, now: Date): Promise<boolean> {
    let touched = false;
    if (sub.status === SubscriptionStatus.TRIALING && sub.trialStartsAt && sub.trialEndsAt) {
      touched = (await this.processActivationWindow(sub, now)) || touched;
      touched = (await this.processTrialNotices(sub, now)) || touched;
      touched = (await this.processTrialEnd(sub, now)) || touched;
    }
    if (sub.status === SubscriptionStatus.GRACE && sub.postTrialGraceUntil) {
      touched = (await this.processGraceEnd(sub, now)) || touched;
    }
    return touched;
  }

  /** Idempotent daily pass for all trialing / post-trial grace subscriptions. */
  async runDaily(now: Date = new Date()): Promise<{ processed: number }> {
    const rows = await this.prisma.subscription.findMany({
      where: {
        status: { in: [SubscriptionStatus.TRIALING, SubscriptionStatus.GRACE] },
      },
      include: { tenant: { include: { market: true } } },
    });
    let processed = 0;
    for (const row of rows) {
      if (await this.runDailyForSubscription(row as SubRow, now)) processed += 1;
    }
    return { processed };
  }

  private async processActivationWindow(sub: SubRow, now: Date): Promise<boolean> {
    const config = this.configFor(sub);
    if (!sub.trialStartsAt || sub.trialQualifiedAt) return false;

    let touched = false;
    const warnAt = new Date(sub.trialStartsAt.getTime() + config.shortenWarningDay * MS_DAY);
    if (now >= warnAt && !sub.trialShortenWarnedAt) {
      await this.sendTrialNotification(sub, "trial_activation_warning", {
        daysUntilShorten: config.activationWindowDays - config.shortenWarningDay,
        minVisits: config.minQualifyingVisits,
      });
      await this.prisma.subscription.update({
        where: { id: sub.id },
        data: { trialShortenWarnedAt: now },
      });
      await this.subscriptions.recordSubscriptionEventOutsideTx(
        sub.id,
        sub.tenantId,
        "trial_shorten_warning",
        null,
        { warnedAt: now.toISOString(), shortenWarningDay: config.shortenWarningDay },
        null,
        "subscription.trial_shorten_warning",
      );
      touched = true;
    }

    const windowEnd = new Date(sub.trialStartsAt.getTime() + config.activationWindowDays * MS_DAY);
    if (now < windowEnd) return touched;

    const count = await countQualifyingTrialVisits(this.prisma, sub.tenantId, sub.trialStartsAt, config);
    const { qualified } = trialActivationProgress(count, config);
    if (qualified) return touched;

    const newEnd = standardTrialEndsAt(sub.trialStartsAt, config);
    if (sub.trialEndsAt && sub.trialEndsAt.getTime() <= newEnd.getTime()) return touched;

    await this.prisma.$transaction(async (tx) => {
      await tx.subscription.update({
        where: { id: sub.id },
        data: { trialEndsAt: newEnd },
      });
      await this.subscriptions.recordSubscriptionEvent(
        tx,
        sub.id,
        sub.tenantId,
        "trial_shortened",
        { trialEndsAt: sub.trialEndsAt?.toISOString() ?? null, qualifyingVisits: count },
        { trialEndsAt: newEnd.toISOString(), standardDays: config.standardDays },
        null,
        "subscription.trial_shortened",
      );
    });
    await this.sendTrialNotification(sub, "trial_shortened", { trialEndsAt: newEnd.toISOString(), qualifyingVisits: count });
    return true;
  }

  private async processTrialNotices(sub: SubRow, now: Date): Promise<boolean> {
    if (!sub.trialEndsAt) return false;
    const config = this.configFor(sub);
    const msToEnd = sub.trialEndsAt.getTime() - now.getTime();
    const daysLeft = msToEnd / MS_DAY;
    if (daysLeft < 0) return false;

    let sent = false;
    for (const threshold of config.endNoticeDays) {
      if (daysLeft <= threshold && daysLeft > threshold - 1) {
        const ok = await this.subscriptions.recordTrialEndingNotice(
          sub.id,
          sub.tenantId,
          sub.trialEndsAt,
          threshold,
        );
        if (ok) {
          await this.sendTrialNotification(sub, "trial_ending", {
            daysLeft: Math.ceil(daysLeft),
            trialEndsAt: sub.trialEndsAt.toISOString(),
          });
          sent = true;
        }
      }
    }
    return sent;
  }

  private async processTrialEnd(sub: SubRow, now: Date): Promise<boolean> {
    if (!sub.trialEndsAt || sub.trialEndsAt > now) return false;

    const hasPayment = Boolean(sub.defaultPaymentMethodId?.trim());
    if (hasPayment) {
      await this.subscriptions.activateSubscription(sub.tenantId, null);
      return true;
    }

    const config = this.configFor(sub);
    const graceUntil = new Date(now.getTime() + config.postTrialGraceDays * MS_DAY);

    await this.prisma.$transaction(async (tx) => {
      await tx.subscription.update({
        where: { id: sub.id },
        data: {
          status: SubscriptionStatus.GRACE,
          postTrialGraceUntil: graceUntil,
        },
      });
      await this.subscriptions.recordSubscriptionEvent(
        tx,
        sub.id,
        sub.tenantId,
        "trial_grace_started",
        { status: sub.status },
        { status: SubscriptionStatus.GRACE, postTrialGraceUntil: graceUntil.toISOString() },
        null,
        "subscription.trial_grace_started",
      );
    });
    await this.sendTrialNotification(sub, "trial_grace_started", {
      graceDays: config.postTrialGraceDays,
      graceUntil: graceUntil.toISOString(),
    });
    return true;
  }

  private async processGraceEnd(sub: SubRow, now: Date): Promise<boolean> {
    if (!sub.postTrialGraceUntil || sub.postTrialGraceUntil > now) return false;
    if (sub.defaultPaymentMethodId?.trim()) {
      await this.subscriptions.activateSubscription(sub.tenantId, null);
      return true;
    }
    return this.downgradeToLite(sub);
  }

  async downgradeToLite(sub: SubRow): Promise<boolean> {
    const lite = await this.prisma.plan.findUnique({ where: { key: PlanKey.LITE } });
    if (!lite) {
      this.log.error("LITE plan missing; cannot downgrade tenant %s", sub.tenantId);
      return false;
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: sub.tenantId },
      select: { marketId: true },
    });
    const price = tenant?.marketId
      ? await this.prisma.planPrice.findFirst({
          where: {
            planId: lite.id,
            marketId: tenant.marketId,
            validTo: null,
          },
          orderBy: { priceVersion: "desc" },
        })
      : null;

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.subscription.update({
        where: { id: sub.id },
        data: {
          planId: lite.id,
          planPriceId: price?.id ?? null,
          status: SubscriptionStatus.ACTIVE,
          trialEndsAt: null,
          trialStartsAt: null,
          trialPlanId: null,
          postTrialGraceUntil: null,
        },
      });
      await this.subscriptions.recordSubscriptionEvent(
        tx,
        sub.id,
        sub.tenantId,
        "trial_downgraded_lite",
        { planId: sub.planId, status: sub.status },
        { planId: lite.id, status: SubscriptionStatus.ACTIVE },
        null,
        "subscription.trial_downgraded_lite",
      );
    });
    await this.sendTrialNotification(sub, "trial_downgraded_lite", { planKey: PlanKey.LITE });
    return true;
  }

  private async sendTrialNotification(
    sub: SubRow,
    kind: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const owner = await this.prisma.user.findFirst({
      where: { tenantId: sub.tenantId, isTenantOwner: true, deletedAt: null },
      select: {
        id: true,
        email: true,
        displayName: true,
        employee: { select: { phone: true } },
      },
    });
    const ownerPhone = owner?.employee?.phone ?? null;
    const base = { tenantId: sub.tenantId, kind, ...payload };

    await this.prisma.outboxEvent.create({
      data: {
        tenantId: sub.tenantId,
        topic: "billing.trial_notification",
        payloadJson: { channel: "email", to: owner?.email, ...base } as Prisma.InputJsonValue,
        status: "PENDING",
      },
    });
    if (ownerPhone) {
      await this.prisma.outboxEvent.create({
        data: {
          tenantId: sub.tenantId,
          topic: "billing.trial_notification",
          payloadJson: {
            channel: MessageChannel.WHATSAPP,
            toPhone: ownerPhone,
            ...base,
          } as Prisma.InputJsonValue,
          status: "PENDING",
        },
      });
    }
    if (owner) {
      await this.prisma.auditLog.create({
        data: {
          tenantId: sub.tenantId,
          actorId: null,
          clinicId: null,
          action: `subscription.${kind}`,
          resource: "Subscription",
          resourceId: sub.id,
          metadata: { inApp: true, userId: owner.id, ...base } as Prisma.InputJsonValue,
        },
      });
    }
  }

  async extendTrial(
    tenantId: string,
    days: number,
    reason: string,
    actorUserId: string,
  ): Promise<{ trialEndsAt: string }> {
    if (days < 1 || days > 365) throw new BadRequestException("days must be between 1 and 365");
    const sub = await this.loadSub(tenantId);
    if (!sub.trialEndsAt && sub.status !== SubscriptionStatus.TRIALING) {
      throw new ForbiddenException("Tenant is not on an active trial");
    }
    const base = sub.trialEndsAt ?? new Date();
    const newEnd = new Date(base.getTime() + days * MS_DAY);

    await this.prisma.$transaction(async (tx) => {
      await tx.subscription.update({
        where: { id: sub.id },
        data: { trialEndsAt: newEnd, status: SubscriptionStatus.TRIALING, postTrialGraceUntil: null },
      });
      await this.subscriptions.recordSubscriptionEvent(
        tx,
        sub.id,
        tenantId,
        "trial_extended",
        { trialEndsAt: sub.trialEndsAt?.toISOString() ?? null },
        { trialEndsAt: newEnd.toISOString(), days, reason },
        actorUserId,
        "subscription.trial_extended",
      );
    });
    return { trialEndsAt: newEnd.toISOString() };
  }

  async patchTrialConfigOverride(
    tenantId: string,
    override: TrialConfigOverride,
    reason: string,
    actorUserId: string,
  ): Promise<void> {
    const sub = await this.loadSub(tenantId);
    await this.prisma.$transaction(async (tx) => {
      await tx.subscription.update({
        where: { id: sub.id },
        data: { trialConfigOverride: override as Prisma.InputJsonValue },
      });
      await this.subscriptions.recordSubscriptionEvent(
        tx,
        sub.id,
        tenantId,
        "trial_config_override",
        { trialConfigOverride: sub.trialConfigOverride },
        { trialConfigOverride: override, reason },
        actorUserId,
        "subscription.trial_config_override",
      );
    });
  }

  /** Signup helper — compute trial end from market + optional cohort. */
  static trialEndsAtForNewSignup(
    trialStartsAt: Date,
    marketFeatureDefaults: unknown,
    cohortKey: string | null,
    override?: TrialConfigOverride | null,
  ): Date {
    const config = resolveTrialConfig({ marketFeatureDefaults, cohortKey, override });
    const cohortDays = cohortTrialDaysFromMarket(marketFeatureDefaults, cohortKey);
    return initialTrialEndsAt(trialStartsAt, config, cohortDays);
  }
}