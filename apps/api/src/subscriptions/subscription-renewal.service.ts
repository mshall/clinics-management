import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { BillingInterval, MessageChannel, PlanKey, Prisma, SubscriptionStatus, UserRole } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { hasRole, isTenantOwnerPrincipal } from "../common/effective-roles";
import { isPlatformSuperAdmin } from "../common/platform-super-admin";
import { LegalAcceptanceService } from "../legal/legal-acceptance.service";
import { isPaidPlanKey } from "../legal/legal-catalog";
import { assertEgyptPdpcPaidLaunchAllowed } from "../compliance/pdpc-egypt-launch-gate";
import { MarketplaceListingService } from "../marketplace/marketplace-listing.service";
import { resolveMarketForTenant } from "../markets/market-resolver";
import { ACTIVE_PRICE_WHERE } from "../plans/plans-active-prices";
import { PrismaService } from "../prisma/prisma.service";
import { BillingSeatService } from "./billing-seat.service";
import { SubscriptionService } from "./subscription.service";
import { addBillingPeriod } from "./subscription-period";
import {
  computeDowngradeImpact,
  decidePeriodEnd,
  effectiveAutoRenew,
  isFreeFloorPlan,
  liteGraceActive,
  liteKeyForPlan,
  nextOutsideQuietHours,
  reminderOffsetsDue,
  subscriptionPolicyFromFeatureDefaults,
  type DowngradeImpact,
  type EntitlementMap,
  type SubscriptionPolicy,
} from "./subscription-policy";

export const SUBSCRIPTION_NOTICE_TOPIC = "billing.subscription_notice";

export type SubscriptionNoticeKind =
  | "renewal_reminder"
  | "renewal_off_reminder"
  | "payment_method_missing"
  | "payment_failed"
  | "downgrade_warning"
  | "downgraded_to_lite"
  | "auto_renew_off"
  | "auto_renew_on"
  | "reactivated";

const MS_DAY = 86_400_000;
/** Cairo is UTC+2 (no DST since 2023 reintroduction is handled by the market timezone in the full pack; offset is a quiet-hours approximation). */
const DEFAULT_TZ_OFFSET_HOURS = 2;

function planEntitlementMap(rows: { key: string; valueJson: unknown }[]): EntitlementMap {
  const out: EntitlementMap = {};
  for (const r of rows) {
    const v = r.valueJson;
    if (typeof v === "boolean" || typeof v === "number") out[r.key] = v;
    else if (v && typeof v === "object" && !Array.isArray(v)) out[r.key] = v as Record<string, unknown>;
    else out[r.key] = Boolean(v);
  }
  return out;
}

function assertAutoRenewManager(user: JwtUser): void {
  if (isTenantOwnerPrincipal(user) || hasRole(user, UserRole.GROUP_ADMIN) || hasRole(user, UserRole.CLINIC_ADMIN)) return;
  throw new ForbiddenException("Only the organization owner or an organization admin can change auto-renew");
}

@Injectable()
export class SubscriptionRenewalService {
  private readonly log = new Logger(SubscriptionRenewalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptions: SubscriptionService,
    private readonly seats: BillingSeatService,
    private readonly listings: MarketplaceListingService,
    private readonly legal: LegalAcceptanceService,
  ) {}

  async loadPolicy(tenantId: string): Promise<SubscriptionPolicy> {
    try {
      const ctx = await resolveMarketForTenant(this.prisma, tenantId);
      return subscriptionPolicyFromFeatureDefaults(ctx.market.featureDefaults);
    } catch {
      return subscriptionPolicyFromFeatureDefaults(null);
    }
  }

  // ---------------------------------------------------------------- state & impact

  async getImpact(tenantId: string, toPlanKey?: PlanKey): Promise<DowngradeImpact> {
    const sub = await this.prisma.subscription.findUnique({ where: { tenantId }, include: { plan: true } });
    if (!sub) throw new NotFoundException("Subscription not found");
    const policy = await this.loadPolicy(tenantId);
    const target = toPlanKey ?? liteKeyForPlan(sub.plan.key);
    const [fromRows, toPlan] = await Promise.all([
      this.prisma.planEntitlement.findMany({ where: { planId: sub.planId } }),
      this.prisma.plan.findUnique({ where: { key: target }, include: { entitlements: true } }),
    ]);
    if (!toPlan) throw new NotFoundException("Target plan not found");
    const [clinicians, branches] = await Promise.all([
      this.prisma.user.count({ where: { tenantId, deletedAt: null, role: UserRole.PHYSICIAN } }),
      this.prisma.clinic.count({ where: { tenantId } }),
    ]);
    return computeDowngradeImpact({
      fromPlanKey: sub.plan.key,
      toPlanKey: target,
      from: planEntitlementMap(fromRows),
      to: planEntitlementMap(toPlan.entitlements),
      usage: { max_clinicians: clinicians, max_branches: branches },
      readOnlyGraceDays: policy.liteReadOnlyGraceDays,
    });
  }

  /** Tenant-facing renewal state for the Upgrade plan page and the staff app card. */
  async getRenewalState(user: JwtUser, tenantId: string) {
    if (user.tenantId !== tenantId) throw new ForbiddenException();
    const sub = await this.prisma.subscription.findUnique({
      where: { tenantId },
      include: { plan: true, defaultPaymentMethod: true, planPrice: true },
    });
    if (!sub) throw new NotFoundException("Subscription not found");
    const policy = await this.loadPolicy(tenantId);
    const now = new Date();
    const onFree = isFreeFloorPlan(sub.plan.key);
    const effective = effectiveAutoRenew(sub);
    const forced = sub.autoRenewForced === "ON" || sub.autoRenewForced === "OFF" ? sub.autoRenewForced : null;
    const impact = !onFree ? await this.getImpact(tenantId) : null;
    const previousPlan = sub.previousPlanId
      ? await this.prisma.plan.findUnique({ where: { id: sub.previousPlanId }, select: { key: true, nameEn: true, nameAr: true } })
      : null;
    return {
      plan: { key: sub.plan.key, nameEn: sub.plan.nameEn, nameAr: sub.plan.nameAr },
      status: sub.status,
      onFreePlan: onFree,
      autoRenew: onFree ? false : effective,
      autoRenewForced: forced,
      /** False when the platform forced it or the market policy forbids org-level opt-out. */
      canChangeAutoRenew: !onFree && forced == null && (policy.orgMayDisableAutoRenew || !effective),
      willDowngradeAtPeriodEnd: !onFree && !effective,
      currentPeriodEnd: sub.currentPeriodEnd.toISOString(),
      renewsOn: !onFree && effective ? sub.currentPeriodEnd.toISOString() : null,
      endsOn: !onFree && !effective ? sub.currentPeriodEnd.toISOString() : null,
      paymentMethod: sub.defaultPaymentMethod
        ? {
            id: sub.defaultPaymentMethod.id,
            brand: sub.defaultPaymentMethod.brand,
            last4: sub.defaultPaymentMethod.last4,
            expMonth: sub.defaultPaymentMethod.expMonth,
            expYear: sub.defaultPaymentMethod.expYear,
          }
        : null,
      downgradedToLiteAt: sub.downgradedToLiteAt?.toISOString() ?? null,
      downgradeReason: sub.downgradeReason,
      liteReadOnlyGraceUntil: liteGraceActive(sub, now) ? sub.liteReadOnlyGraceUntil!.toISOString() : null,
      previousPlan,
      canReactivate: onFree && sub.previousPlanId != null,
      downgradeImpact: impact,
      policy: {
        lapseAction: policy.lapseAction,
        downgradeAfterDays: policy.downgradeAfterDays,
        renewalReminderDaysBefore: policy.renewalReminderDaysBefore,
        liteReadOnlyGraceDays: policy.liteReadOnlyGraceDays,
      },
    };
  }

  // ---------------------------------------------------------------- auto-renew switch

  async setAutoRenew(user: JwtUser, tenantId: string, body: { enabled: boolean; confirmDowngrade?: boolean }) {
    if (user.tenantId !== tenantId) throw new ForbiddenException();
    assertAutoRenewManager(user);
    const policy = await this.loadPolicy(tenantId);
    const sub = await this.prisma.subscription.findUnique({ where: { tenantId }, include: { plan: true } });
    if (!sub) throw new NotFoundException("Subscription not found");
    if (isFreeFloorPlan(sub.plan.key)) {
      throw new BadRequestException({ code: "AUTO_RENEW_NOT_APPLICABLE", message: "The free plan has nothing to renew" });
    }
    if (sub.autoRenewForced) {
      throw new ForbiddenException({ code: "AUTO_RENEW_FORCED", message: `Auto-renew is set to ${sub.autoRenewForced} by the platform` });
    }
    if (!body.enabled) {
      if (!policy.orgMayDisableAutoRenew) {
        throw new ForbiddenException({ code: "AUTO_RENEW_CANNOT_DISABLE", message: "Auto-renew cannot be switched off in this market" });
      }
      // The downgrade consequences must be seen and confirmed BEFORE the switch is applied.
      if (body.confirmDowngrade !== true) {
        throw new BadRequestException({
          code: "AUTO_RENEW_CONFIRMATION_REQUIRED",
          message: "Confirm that the plan moves to Lite at the end of the period",
          impact: await this.getImpact(tenantId),
          endsOn: sub.currentPeriodEnd.toISOString(),
        });
      }
    }
    if (sub.autoRenew === body.enabled) return this.getRenewalState(user, tenantId);

    await this.prisma.$transaction(async (tx) => {
      await tx.subscription.update({
        where: { id: sub.id },
        data: {
          autoRenew: body.enabled,
          cancelAtPeriodEnd: !body.enabled,
          autoRenewChangedAt: new Date(),
          autoRenewChangedBy: user.userId,
        },
      });
      await this.subscriptions.recordSubscriptionEvent(
        tx,
        sub.id,
        tenantId,
        body.enabled ? "auto_renew_on" : "auto_renew_off",
        { autoRenew: sub.autoRenew },
        { autoRenew: body.enabled, effectiveAt: sub.currentPeriodEnd.toISOString() },
        user.userId,
        body.enabled ? "subscription.auto_renew_on" : "subscription.auto_renew_off",
      );
    });
    await this.notifyOwner(tenantId, sub.id, body.enabled ? "auto_renew_on" : "auto_renew_off", {
      planKey: sub.plan.key,
      endsOn: sub.currentPeriodEnd.toISOString(),
    });
    return this.getRenewalState(user, tenantId);
  }

  /** Platform super admin: force auto-renew ON/OFF (or clear the force with null). Reason is mandatory and audited. */
  async platformForceAutoRenew(user: JwtUser, tenantId: string, force: "ON" | "OFF" | null, reason: string) {
    if (!isPlatformSuperAdmin(user)) throw new ForbiddenException("Platform super admin only");
    if (!reason?.trim()) throw new BadRequestException("reason is required");
    const sub = await this.prisma.subscription.findUnique({ where: { tenantId } });
    if (!sub) throw new NotFoundException("Subscription not found");
    await this.prisma.$transaction(async (tx) => {
      await tx.subscription.update({
        where: { id: sub.id },
        data: {
          autoRenewForced: force,
          ...(force ? { autoRenew: force === "ON", cancelAtPeriodEnd: force === "OFF" } : {}),
          autoRenewChangedAt: new Date(),
          autoRenewChangedBy: user.userId,
        },
      });
      await this.subscriptions.recordSubscriptionEvent(
        tx,
        sub.id,
        tenantId,
        "auto_renew_forced",
        { autoRenew: sub.autoRenew, autoRenewForced: sub.autoRenewForced },
        { autoRenewForced: force, reason: reason.trim() },
        user.userId,
        "subscription.auto_renew_forced",
      );
    });
    return { tenantId, autoRenewForced: force };
  }

  // ---------------------------------------------------------------- downgrade to Lite

  /**
   * Moves a tenant to the free plan. Idempotent and concurrency-safe: the conditional update only matches while the
   * subscription still sits on its paid plan, so parallel runs produce exactly one downgrade and one event.
   * Nothing is deleted: seats beyond the Lite cap become read-only (reconcileToSeatCap) and Lite-excluded modules stay
   * readable for `liteReadOnlyGraceDays`.
   */
  async downgradeToLite(
    tenantId: string,
    reason: "auto_renew_off" | "dunning_exhausted" | "platform_forced" | "trial_ended" | "period_end_cancel",
    actorUserId: string | null,
    now: Date = new Date(),
  ): Promise<boolean> {
    const sub = await this.prisma.subscription.findUnique({ where: { tenantId }, include: { plan: true } });
    if (!sub) throw new NotFoundException("Subscription not found");
    if (isFreeFloorPlan(sub.plan.key)) return false;

    const liteKey = liteKeyForPlan(sub.plan.key);
    const lite = await this.prisma.plan.findUnique({ where: { key: liteKey }, include: { entitlements: true } });
    if (!lite) {
      this.log.error(`Lite plan ${liteKey} missing; cannot downgrade tenant ${tenantId}`);
      return false;
    }
    const policy = await this.loadPolicy(tenantId);
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { marketId: true } });
    const litePrice = tenant?.marketId
      ? await this.prisma.planPrice.findFirst({
          where: { planId: lite.id, marketId: tenant.marketId, interval: BillingInterval.MONTHLY, ...ACTIVE_PRICE_WHERE(now) },
          orderBy: { priceVersion: "desc" },
        })
      : null;
    const liteSeatCap = lite.entitlements.find((e) => e.key === "max_clinicians")?.valueJson;
    const seatCap = typeof liteSeatCap === "number" && liteSeatCap > 0 ? Math.min(sub.clinicianSeats, liteSeatCap) : sub.clinicianSeats;

    const periodElapsed = sub.currentPeriodEnd <= now;
    const nextStart = periodElapsed ? sub.currentPeriodEnd : sub.currentPeriodStart;
    const nextEnd = periodElapsed ? addBillingPeriod(sub.currentPeriodEnd, BillingInterval.MONTHLY) : sub.currentPeriodEnd;

    const moved = await this.prisma.$transaction(async (tx) => {
      const res = await tx.subscription.updateMany({
        where: { id: sub.id, planId: sub.planId },
        data: {
          previousPlanId: sub.planId,
          previousPlanPriceId: sub.planPriceId,
          previousInterval: sub.interval,
          previousClinicianSeats: sub.clinicianSeats,
          planId: lite.id,
          planPriceId: litePrice?.id ?? null,
          interval: BillingInterval.MONTHLY,
          clinicianSeats: seatCap,
          status: SubscriptionStatus.ACTIVE,
          autoRenew: true,
          cancelAtPeriodEnd: false,
          downgradedToLiteAt: now,
          downgradeReason: reason,
          liteReadOnlyGraceUntil: new Date(now.getTime() + policy.liteReadOnlyGraceDays * MS_DAY),
          scheduledPlanId: null,
          scheduledPlanPriceId: null,
          scheduledInterval: null,
          scheduledClinicianSeats: null,
          scheduledEffectiveAt: null,
          currentPeriodStart: nextStart,
          currentPeriodEnd: nextEnd,
        },
      });
      if (res.count === 0) return false;
      await this.subscriptions.recordSubscriptionEvent(
        tx,
        sub.id,
        tenantId,
        "downgraded_to_lite",
        { planId: sub.planId, planKey: sub.plan.key, status: sub.status, clinicianSeats: sub.clinicianSeats },
        { planId: lite.id, planKey: liteKey, status: SubscriptionStatus.ACTIVE, reason, readOnlyGraceDays: policy.liteReadOnlyGraceDays },
        actorUserId,
        "subscription.downgraded_to_lite",
      );
      return true;
    });
    if (!moved) return false;

    await this.seats.reconcileToSeatCap(tenantId, seatCap);
    await this.listings.recomputeTenantListings(tenantId).catch((e) => this.log.warn(e instanceof Error ? e.message : String(e)));
    await this.notifyOwner(tenantId, sub.id, "downgraded_to_lite", {
      fromPlanKey: sub.plan.key,
      reason,
      readOnlyGraceDays: policy.liteReadOnlyGraceDays,
    });
    return true;
  }

  /** Platform: move a tenant to Lite on purpose (reason mandatory, audited). */
  async platformForceDowngrade(user: JwtUser, tenantId: string, reason: string) {
    if (!isPlatformSuperAdmin(user)) throw new ForbiddenException("Platform super admin only");
    if (!reason?.trim()) throw new BadRequestException("reason is required");
    const moved = await this.downgradeToLite(tenantId, "platform_forced", user.userId);
    await this.prisma.auditLog.create({
      data: {
        tenantId,
        actorId: user.userId,
        action: "subscription.platform_force_downgrade",
        resource: "Subscription",
        resourceId: tenantId,
        metadata: { reason: reason.trim(), moved } as Prisma.InputJsonValue,
      },
    });
    return { tenantId, moved };
  }

  // ---------------------------------------------------------------- reactivate / upgrade from Lite

  /**
   * One-click return to the plan the tenant had before Lite (or any paid plan key). Same legal and launch gates as
   * `changePlan`. Billing for the new period flows through the monthly settlement and the saved card, as for any paid plan.
   */
  async reactivate(
    user: JwtUser,
    tenantId: string,
    body: { planKey?: PlanKey; interval?: BillingInterval; seats?: number } = {},
  ) {
    if (user.tenantId !== tenantId) throw new ForbiddenException();
    assertAutoRenewManager(user);
    const sub = await this.prisma.subscription.findUnique({
      where: { tenantId },
      include: { plan: true, defaultPaymentMethod: true },
    });
    if (!sub) throw new NotFoundException("Subscription not found");
    if (!isFreeFloorPlan(sub.plan.key)) {
      throw new BadRequestException({ code: "ALREADY_PAID", message: "The subscription is already on a paid plan" });
    }
    const previous = sub.previousPlanId ? await this.prisma.plan.findUnique({ where: { id: sub.previousPlanId } }) : null;
    const planKey = body.planKey ?? previous?.key;
    if (!planKey || isFreeFloorPlan(planKey)) {
      throw new BadRequestException({ code: "PLAN_REQUIRED", message: "Choose a paid plan to upgrade to" });
    }
    const plan = await this.prisma.plan.findUnique({ where: { key: planKey } });
    if (!plan) throw new BadRequestException("Unknown plan");
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { marketId: true } });
    if (!tenant?.marketId) throw new BadRequestException("Organization has no market");
    const interval = body.interval ?? sub.previousInterval ?? BillingInterval.MONTHLY;
    const now = new Date();
    const price = await this.prisma.planPrice.findFirst({
      where: { planId: plan.id, marketId: tenant.marketId, interval, ...ACTIVE_PRICE_WHERE(now) },
      orderBy: { priceVersion: "desc" },
    });
    if (!price) throw new BadRequestException({ code: "NO_ACTIVE_PRICE", message: "No active price for this plan in your market" });

    if (isPaidPlanKey(planKey)) {
      await this.legal.assertPaidPlanForUser(user.userId, tenantId, planKey);
      await assertEgyptPdpcPaidLaunchAllowed(this.prisma, tenantId);
    }
    const policy = await this.loadPolicy(tenantId);
    const seats = Math.max(1, body.seats ?? sub.previousClinicianSeats ?? sub.clinicianSeats);
    const periodEnd = addBillingPeriod(now, interval);

    const res = await this.prisma.$transaction(async (tx) => {
      const r = await tx.subscription.updateMany({
        where: { id: sub.id, planId: sub.planId },
        data: {
          planId: plan.id,
          planPriceId: price.id,
          interval,
          clinicianSeats: seats,
          status: SubscriptionStatus.ACTIVE,
          autoRenew: policy.autoRenewDefault,
          cancelAtPeriodEnd: !policy.autoRenewDefault,
          autoRenewChangedAt: now,
          autoRenewChangedBy: user.userId,
          downgradedToLiteAt: null,
          downgradeReason: null,
          liteReadOnlyGraceUntil: null,
          previousPlanId: null,
          previousPlanPriceId: null,
          previousInterval: null,
          previousClinicianSeats: null,
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
        },
      });
      if (r.count === 0) return false;
      await this.subscriptions.recordSubscriptionEvent(
        tx,
        sub.id,
        tenantId,
        "reactivated",
        { planId: sub.planId, planKey: sub.plan.key },
        { planId: plan.id, planKey, interval, clinicianSeats: seats, autoRenew: policy.autoRenewDefault },
        user.userId,
        "subscription.reactivated",
      );
      return true;
    });
    if (res) {
      await this.seats.reconcileToSeatCap(tenantId, seats).catch(() => undefined);
      await this.listings.recomputeTenantListings(tenantId).catch(() => undefined);
      await this.notifyOwner(tenantId, sub.id, "reactivated", { planKey });
    }
    return {
      reactivated: res,
      needsPaymentMethod: sub.defaultPaymentMethod == null,
      state: await this.getRenewalState(user, tenantId),
    };
  }

  // ---------------------------------------------------------------- scheduler pass

  /** Idempotent daily pass (safe to run any number of times, concurrently). */
  async runDaily(now: Date = new Date()): Promise<{ downgraded: number; renewed: number; reminders: number }> {
    let downgraded = 0;
    let renewed = 0;
    let reminders = 0;

    const due = await this.prisma.subscription.findMany({
      where: { status: SubscriptionStatus.ACTIVE, currentPeriodEnd: { lte: now } },
      include: { plan: { select: { key: true } } },
      take: 500,
    });
    for (const sub of due) {
      try {
        const decision = decidePeriodEnd({
          status: sub.status,
          planKey: sub.plan.key,
          autoRenew: effectiveAutoRenew(sub),
          cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
          currentPeriodEnd: sub.currentPeriodEnd,
          now,
        });
        if (decision === "DOWNGRADE_AUTO_RENEW_OFF") {
          if (await this.downgradeToLite(sub.tenantId, "auto_renew_off", null, now)) downgraded += 1;
        } else if (decision === "RENEW") {
          if (await this.subscriptions.rollBillingPeriod(sub.tenantId, null)) renewed += 1;
        }
      } catch (e) {
        this.log.warn(`period end ${sub.tenantId}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    const horizonDays = 90;
    const upcoming = await this.prisma.subscription.findMany({
      where: {
        status: SubscriptionStatus.ACTIVE,
        currentPeriodEnd: { gt: now, lte: new Date(now.getTime() + horizonDays * MS_DAY) },
        plan: { key: { notIn: [PlanKey.LITE, PlanKey.NURSE_LITE] } },
      },
      include: { plan: { select: { key: true, nameEn: true } }, planPrice: true },
      take: 1000,
    });
    for (const sub of upcoming) {
      try {
        reminders += await this.sendRenewalReminders(sub, now);
      } catch (e) {
        this.log.warn(`reminder ${sub.tenantId}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return { downgraded, renewed, reminders };
  }

  private async sendRenewalReminders(
    sub: Prisma.SubscriptionGetPayload<{ include: { plan: { select: { key: true; nameEn: true } }; planPrice: true } }>,
    now: Date,
  ): Promise<number> {
    const policy = await this.loadPolicy(sub.tenantId);
    const periodMarker = sub.currentPeriodEnd.toISOString();
    const sentEvents = await this.prisma.subscriptionEvent.findMany({
      where: { subscriptionId: sub.id, type: "renewal_reminder_sent" },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    const alreadySent = sentEvents
      .map((e) => e.toJson as { periodEnd?: string; offset?: number } | null)
      .filter((j) => j?.periodEnd === periodMarker && typeof j.offset === "number")
      .map((j) => j!.offset as number);
    const offsets = reminderOffsetsDue({
      currentPeriodEnd: sub.currentPeriodEnd,
      now,
      offsets: policy.renewalReminderDaysBefore,
      alreadySent,
    });
    if (offsets.length === 0) return 0;
    const offset = offsets[0]!;

    const effective = effectiveAutoRenew(sub);
    const kind: SubscriptionNoticeKind = !effective
      ? "renewal_off_reminder"
      : sub.defaultPaymentMethodId
        ? "renewal_reminder"
        : "payment_method_missing";
    // Dedupe at the database: one event per (period, offset). A concurrent run that loses the race sees the same marker and skips.
    const claimed = await this.prisma.$transaction(async (tx) => {
      const again = await tx.subscriptionEvent.findFirst({
        where: { subscriptionId: sub.id, type: "renewal_reminder_sent", createdAt: { gte: new Date(now.getTime() - 60_000) } },
      });
      const j = again?.toJson as { periodEnd?: string; offset?: number } | null;
      if (j?.periodEnd === periodMarker && j.offset === offset) return false;
      await tx.subscriptionEvent.create({
        data: { subscriptionId: sub.id, type: "renewal_reminder_sent", toJson: { periodEnd: periodMarker, offset, kind } as Prisma.InputJsonValue },
      });
      return true;
    });
    if (!claimed) return 0;
    const amount = sub.planPrice ? Number(sub.planPrice.amount) * (sub.planPrice.unit === "PER_CLINICIAN" ? sub.clinicianSeats : 1) : null;
    await this.notifyOwner(
      sub.tenantId,
      sub.id,
      kind,
      {
        planKey: sub.plan.key,
        planName: sub.plan.nameEn,
        renewsOn: periodMarker,
        daysBefore: offset,
        amount: amount != null ? amount.toFixed(2) : null,
        currency: sub.planPrice?.currency ?? null,
      },
      nextOutsideQuietHours(now, policy.reminderQuietHours, DEFAULT_TZ_OFFSET_HOURS),
    );
    return 1;
  }

  // ---------------------------------------------------------------- notifications (existing outbox hub)

  /**
   * Billing notices go through the INTERNAL outbox like trial notices. They are account-holder transactional messages
   * (not marketing); reminders are deferred out of the owner's quiet hours. Delivery respects the messaging hub adapters
   * (MODE=mock by default), so nothing reaches a real vendor from here.
   */
  async notifyOwner(
    tenantId: string,
    subscriptionId: string,
    kind: SubscriptionNoticeKind,
    payload: Record<string, unknown>,
    notBefore: Date = new Date(),
  ): Promise<void> {
    const owner = await this.prisma.user.findFirst({
      where: { tenantId, isTenantOwner: true, deletedAt: null },
      select: { email: true, employee: { select: { phone: true } } },
    });
    const base = { tenantId, subscriptionId, kind, ...payload };
    await this.prisma.outboxEvent.create({
      data: {
        tenantId,
        type: SUBSCRIPTION_NOTICE_TOPIC,
        payload: { channel: "email", to: owner?.email ?? null, ...base } as Prisma.InputJsonValue,
        aggregateType: "Subscription",
        aggregateId: subscriptionId,
        target: "INTERNAL",
        status: "PENDING",
        nextAttemptAt: notBefore,
      },
    });
    const phone = owner?.employee?.phone?.trim();
    if (phone) {
      await this.prisma.outboxEvent.create({
        data: {
          tenantId,
          type: SUBSCRIPTION_NOTICE_TOPIC,
          payload: { channel: MessageChannel.WHATSAPP, toPhone: phone, ...base } as Prisma.InputJsonValue,
          aggregateType: "Subscription",
          aggregateId: subscriptionId,
          target: "INTERNAL",
          status: "PENDING",
          nextAttemptAt: notBefore,
        },
      });
    }
  }
}
