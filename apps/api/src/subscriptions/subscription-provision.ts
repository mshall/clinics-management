import {
  BillingInterval,
  PlanKey,
  Prisma,
  SubscriptionStatus,
  type PrismaClient,
} from "@prisma/client";
import { addBillingPeriod } from "./subscription-period";

export type ProvisionSubscriptionOptions = {
  planKey?: PlanKey;
  status?: SubscriptionStatus;
  interval?: BillingInterval;
  clinicianSeats?: number;
  trialDays?: number;
  trialPlanKey?: PlanKey;
};

/** Idempotent: ensures exactly one subscription row per tenant. */
export async function ensureTenantSubscription(
  prisma: PrismaClient,
  tenantId: string,
  opts: ProvisionSubscriptionOptions = {},
): Promise<void> {
  const existing = await prisma.subscription.findUnique({ where: { tenantId } });
  if (existing) return;

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { marketId: true },
  });
  if (!tenant) return;

  const planKey = opts.planKey ?? PlanKey.ENTERPRISE;
  const plan = await prisma.plan.findUnique({ where: { key: planKey } });
  if (!plan) return;

  const interval = opts.interval ?? BillingInterval.MONTHLY;
  let planPriceId: string | null = null;
  if (tenant.marketId) {
    const price = await prisma.planPrice.findFirst({
      where: {
        planId: plan.id,
        marketId: tenant.marketId,
        interval,
        validTo: null,
      },
      orderBy: { priceVersion: "desc" },
    });
    planPriceId = price?.id ?? null;
  }

  const now = new Date();
  const periodEnd = addBillingPeriod(now, interval);
  const trialDays = opts.trialDays ?? 0;
  const trialPlan =
    opts.trialPlanKey != null
      ? await prisma.plan.findUnique({ where: { key: opts.trialPlanKey } })
      : null;

  let status = opts.status ?? SubscriptionStatus.ACTIVE;
  let trialStartsAt: Date | null = null;
  let trialEndsAt: Date | null = null;
  if (trialDays > 0 && trialPlan) {
    status = SubscriptionStatus.TRIALING;
    trialStartsAt = now;
    trialEndsAt = new Date(now.getTime() + trialDays * 86_400_000);
  }

  await prisma.$transaction(async (tx) => {
    const sub = await tx.subscription.create({
      data: {
        tenantId,
        planId: plan.id,
        planPriceId,
        status,
        interval,
        clinicianSeats: opts.clinicianSeats ?? 1,
        trialStartsAt,
        trialEndsAt,
        trialPlanId: trialPlan?.id ?? null,
        activatedAt: status === SubscriptionStatus.ACTIVE ? now : null,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
      },
    });
    await tx.subscriptionEvent.create({
      data: {
        subscriptionId: sub.id,
        type: "created",
        toJson: {
          status,
          planKey,
          interval,
        } as Prisma.InputJsonValue,
      },
    });
  });
}

export async function ensureAllTenantSubscriptions(prisma: PrismaClient): Promise<number> {
  const tenants = await prisma.tenant.findMany({ select: { id: true } });
  let created = 0;
  for (const t of tenants) {
    const before = await prisma.subscription.count({ where: { tenantId: t.id } });
    await ensureTenantSubscription(prisma, t.id, { planKey: PlanKey.ENTERPRISE, clinicianSeats: 5 });
    const after = await prisma.subscription.count({ where: { tenantId: t.id } });
    if (after > before) created += 1;
  }
  return created;
}