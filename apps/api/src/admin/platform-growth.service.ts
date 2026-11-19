import { ForbiddenException, Injectable } from "@nestjs/common";
import { ListingStatus, SubscriptionStatus } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { isPlatformSuperAdmin } from "../common/platform-super-admin";
import { PrismaService } from "../prisma/prisma.service";

const PAID_STATUSES: SubscriptionStatus[] = [
  SubscriptionStatus.ACTIVE,
  SubscriptionStatus.PAST_DUE,
  SubscriptionStatus.GRACE,
  SubscriptionStatus.READ_ONLY,
];

@Injectable()
export class PlatformGrowthService {
  constructor(private readonly prisma: PrismaService) {}

  private assertPlatform(user: JwtUser) {
    if (!isPlatformSuperAdmin(user)) {
      throw new ForbiddenException("Only platform super administrators can view growth analytics");
    }
  }

  /**
   * PA-05 — funnel / cohorts / MRR derived from Tenant, OnboardingProgress, Subscription,
   * MarketplaceListing, and AuditLog (paywall) so numbers are reproducible from event tables.
   */
  async getGrowth(user: JwtUser) {
    this.assertPlatform(user);

    const [
      signups,
      onboardingStarted,
      activated,
      trialEnded,
      paid,
      listingsLive,
      tenantsWithListing,
      paywallHits,
      subscriptions,
      byRepRaw,
      cohortRaw,
    ] = await Promise.all([
      this.prisma.tenant.count(),
      this.prisma.onboardingProgress.count(),
      this.prisma.onboardingProgress.count({ where: { activatedAt: { not: null } } }),
      this.prisma.subscription.count({
        where: {
          OR: [
            { status: { in: PAID_STATUSES } },
            { status: SubscriptionStatus.CANCELLED },
            { AND: [{ trialEndsAt: { lt: new Date() } }, { status: { not: SubscriptionStatus.TRIALING } }] },
          ],
        },
      }),
      this.prisma.subscription.count({ where: { status: { in: PAID_STATUSES } } }),
      this.prisma.marketplaceListing.count({ where: { status: ListingStatus.LIVE } }),
      this.prisma.marketplaceListing.findMany({
        where: { status: ListingStatus.LIVE },
        distinct: ["tenantId"],
        select: { tenantId: true },
      }),
      this.prisma.auditLog.count({
        where: {
          OR: [{ action: { contains: "paywall" } }, { action: { contains: "PLAN_UPGRADE" } }, { action: "entitlement.denied" }],
        },
      }),
      this.prisma.subscription.findMany({
        where: { status: { in: PAID_STATUSES } },
        select: {
          clinicianSeats: true,
          interval: true,
          planPrice: { select: { amount: true, interval: true, currency: true } },
          cohortKey: true,
          salesRepCode: true,
          tenant: { select: { salesRepCode: true, createdAt: true } },
        },
      }),
      this.prisma.tenant.groupBy({
        by: ["salesRepCode"],
        _count: { _all: true },
      }),
      this.prisma.subscription.groupBy({
        by: ["cohortKey"],
        _count: { _all: true },
      }),
    ]);

    let mrr = 0;
    let currency = "EGP";
    for (const s of subscriptions) {
      if (!s.planPrice) continue;
      const amount = Number(s.planPrice.amount);
      currency = s.planPrice.currency || currency;
      const monthly = s.planPrice.interval === "ANNUAL" ? amount / 12 : amount;
      mrr += monthly;
    }
    const arr = mrr * 12;
    const kiorexAttachRate = signups === 0 ? 0 : Math.round((tenantsWithListing.length / signups) * 1000) / 10;

    const byRep = byRepRaw
      .map((r) => ({
        salesRepCode: r.salesRepCode ?? "(organic)",
        signups: r._count._all,
      }))
      .sort((a, b) => b.signups - a.signups);

    const cohorts = cohortRaw
      .map((c) => ({
        cohortKey: c.cohortKey ?? "(none)",
        subscriptions: c._count._all,
      }))
      .sort((a, b) => b.subscriptions - a.subscriptions);

    // Cohort retention: activated / signups in same calendar month (from tenant.createdAt vs activatedAt)
    const monthBuckets = new Map<string, { signups: number; activated: number; paid: number }>();
    const tenants = await this.prisma.tenant.findMany({
      select: {
        createdAt: true,
        onboardingProgress: { select: { activatedAt: true } },
        subscription: { select: { status: true } },
      },
    });
    for (const t of tenants) {
      const key = t.createdAt.toISOString().slice(0, 7);
      const bucket = monthBuckets.get(key) ?? { signups: 0, activated: 0, paid: 0 };
      bucket.signups += 1;
      if (t.onboardingProgress?.activatedAt) bucket.activated += 1;
      if (t.subscription && PAID_STATUSES.includes(t.subscription.status)) bucket.paid += 1;
      monthBuckets.set(key, bucket);
    }
    const retention = [...monthBuckets.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, b]) => ({
        month,
        signups: b.signups,
        activated: b.activated,
        paid: b.paid,
        activationRate: b.signups === 0 ? 0 : Math.round((b.activated / b.signups) * 1000) / 10,
        paidRate: b.signups === 0 ? 0 : Math.round((b.paid / b.signups) * 1000) / 10,
      }));

    return {
      funnel: {
        signup: signups,
        onboardingStarted,
        activated,
        trialEnd: trialEnded,
        paid,
      },
      mrr: { amount: Math.round(mrr * 100) / 100, currency },
      arr: { amount: Math.round(arr * 100) / 100, currency },
      kiorex: {
        liveListings: listingsLive,
        tenantsWithLiveListing: tenantsWithListing.length,
        attachRatePct: kiorexAttachRate,
      },
      paywallConversions: paywallHits,
      byRep,
      cohorts,
      retention,
      sources: {
        note: "Derived from Tenant.salesRepCode and Subscription.cohortKey / AuditLog paywall actions",
      },
    };
  }
}
