import { ForbiddenException, Injectable } from "@nestjs/common";
import { PlanKey, Prisma, SubscriptionStatus } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { isPlatformSuperAdmin } from "../common/platform-super-admin";
import { PrismaService } from "../prisma/prisma.service";
import { effectiveAutoRenew, isFreeFloorPlan } from "./subscription-policy";

const MS_DAY = 86_400_000;

/** SUB-01 platform ops views: subscriptions list, MRR, churn-lite and downgrade counts. Read-only; forced actions live in SubscriptionRenewalService. */
@Injectable()
export class PlatformSubscriptionsService {
  constructor(private readonly prisma: PrismaService) {}

  private assertPlatform(user: JwtUser) {
    if (!isPlatformSuperAdmin(user)) throw new ForbiddenException("Platform super admin only");
  }

  async list(
    user: JwtUser,
    q: { status?: string; planKey?: string; autoRenew?: string; q?: string; page?: number; pageSize?: number },
  ) {
    this.assertPlatform(user);
    const pageSize = Math.min(100, Math.max(1, q.pageSize ?? 25));
    const page = Math.max(1, q.page ?? 1);
    const where: Prisma.SubscriptionWhereInput = {};
    if (q.status && q.status in SubscriptionStatus) where.status = q.status as SubscriptionStatus;
    if (q.planKey && q.planKey in PlanKey) where.plan = { key: q.planKey as PlanKey };
    if (q.autoRenew === "true") where.autoRenew = true;
    if (q.autoRenew === "false") where.autoRenew = false;
    if (q.q?.trim()) where.tenant = { name: { contains: q.q.trim(), mode: "insensitive" } };
    const [total, rows] = await Promise.all([
      this.prisma.subscription.count({ where }),
      this.prisma.subscription.findMany({
        where,
        include: { tenant: { select: { id: true, name: true } }, plan: { select: { key: true, nameEn: true } }, planPrice: { select: { amount: true, currency: true, unit: true } } },
        orderBy: { currentPeriodEnd: "asc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return {
      total,
      page,
      pageSize,
      items: rows.map((s) => ({
        subscriptionId: s.id,
        tenantId: s.tenant.id,
        tenantName: s.tenant.name,
        planKey: s.plan.key,
        planName: s.plan.nameEn,
        status: s.status,
        interval: s.interval,
        seats: s.clinicianSeats,
        autoRenew: isFreeFloorPlan(s.plan.key) ? null : effectiveAutoRenew(s),
        autoRenewForced: s.autoRenewForced,
        currentPeriodEnd: s.currentPeriodEnd.toISOString(),
        downgradedToLiteAt: s.downgradedToLiteAt?.toISOString() ?? null,
        downgradeReason: s.downgradeReason,
        amount: s.planPrice?.amount.toString() ?? null,
        currency: s.planPrice?.currency ?? null,
      })),
    };
  }

  /** MRR (monthly equivalent of active paid subscriptions, per currency), churn-lite and downgrade counts for the window. */
  async metrics(user: JwtUser, windowDays = 30, now: Date = new Date()) {
    this.assertPlatform(user);
    const since = new Date(now.getTime() - windowDays * MS_DAY);
    const paid = await this.prisma.subscription.findMany({
      where: { status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE, SubscriptionStatus.GRACE] }, plan: { key: { notIn: [PlanKey.LITE, PlanKey.NURSE_LITE] } } },
      include: { planPrice: true },
    });
    const mrr = new Map<string, number>();
    for (const s of paid) {
      if (!s.planPrice) continue;
      const base = Number(s.planPrice.amount);
      const full = s.planPrice.unit === "PER_CLINICIAN" ? base * s.clinicianSeats : base + Math.max(0, s.clinicianSeats - s.planPrice.includedClinicians) * Number(s.planPrice.extraClinicianAmount ?? 0);
      const monthly = s.interval === "ANNUAL" ? full / 12 : full;
      mrr.set(s.planPrice.currency, (mrr.get(s.planPrice.currency) ?? 0) + monthly);
    }
    const downgrades = await this.prisma.subscriptionEvent.findMany({ where: { type: "downgraded_to_lite", createdAt: { gte: since } }, select: { toJson: true } });
    const byReason: Record<string, number> = {};
    for (const d of downgrades) {
      const reason = String((d.toJson as { reason?: string } | null)?.reason ?? "unknown");
      byReason[reason] = (byReason[reason] ?? 0) + 1;
    }
    const reactivations = await this.prisma.subscriptionEvent.count({ where: { type: "reactivated", createdAt: { gte: since } } });
    const autoRenewOff = paid.filter((s) => !effectiveAutoRenew(s)).length;
    const startPaid = paid.length + downgrades.length;
    return {
      windowDays,
      paidSubscriptions: paid.length,
      autoRenewOff,
      mrr: [...mrr.entries()].map(([currency, amount]) => ({ currency, amount: amount.toFixed(2) })),
      downgradesToLite: downgrades.length,
      downgradesByReason: byReason,
      reactivations,
      /** Share of paid subscriptions at the start of the window that moved to Lite; not a financial churn measure. */
      churnLite: startPaid === 0 ? 0 : Number((downgrades.length / startPaid).toFixed(4)),
    };
  }
}
