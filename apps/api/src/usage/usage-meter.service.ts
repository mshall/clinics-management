import { ForbiddenException, Injectable } from "@nestjs/common";
import { PlanKey, Prisma, UsageMetric, type PrismaClient } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { usageLimitsForPlan, usageWarningThreshold } from "./usage-limits";

export type UsageMetricSnapshot = {
  metric: UsageMetric;
  quantity: number;
  limit: number;
  warnAt: number;
  percent: number;
  atLimit: boolean;
  nearLimit: boolean;
};

export type TenantUsageSummary = {
  periodKey: string;
  metrics: UsageMetricSnapshot[];
  whatsappPaused: boolean;
};

@Injectable()
export class UsageMeterService {
  constructor(private readonly prisma: PrismaService) {}

  static periodKey(d = new Date()): string {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
  }

  async resolvePlanKey(tenantId: string): Promise<PlanKey> {
    const sub = await this.prisma.subscription.findUnique({
      where: { tenantId },
      select: { plan: { select: { key: true } } },
    });
    return sub?.plan.key ?? PlanKey.ENTERPRISE;
  }

  async incrementOnce(
    tenantId: string,
    metric: UsageMetric,
    sourceId: string,
    amount = 1,
    client: PrismaClient | Prisma.TransactionClient = this.prisma,
  ): Promise<boolean> {
    const trimmed = sourceId.trim();
    if (!trimmed) return false;
    try {
      await client.usageMeterDedup.create({
        data: { tenantId, metric, sourceId: trimmed },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        return false;
      }
      throw e;
    }
    const periodKey = UsageMeterService.periodKey();
    const qty = new Prisma.Decimal(amount);
    await client.usageCounter.upsert({
      where: { tenantId_periodKey_metric: { tenantId, periodKey, metric } },
      create: { tenantId, periodKey, metric, quantity: qty },
      update: { quantity: { increment: qty } },
    });
    return true;
  }

  async assertWhatsAppQuota(tenantId: string): Promise<void> {
    const summary = await this.summaryForTenant(tenantId);
    if (summary.whatsappPaused) {
      throw new ForbiddenException({
        code: "USAGE_QUOTA_EXCEEDED",
        metric: UsageMetric.WHATSAPP_MESSAGES,
        periodKey: summary.periodKey,
        message: "WhatsApp quota reached for this month. Purchase a message pack or upgrade your plan.",
      });
    }
  }

  async summaryForTenant(tenantId: string, periodKey = UsageMeterService.periodKey()): Promise<TenantUsageSummary> {
    const planKey = await this.resolvePlanKey(tenantId);
    const limits = usageLimitsForPlan(planKey);
    const rows = await this.prisma.usageCounter.findMany({
      where: { tenantId, periodKey },
    });
    const byMetric = new Map(rows.map((r) => [r.metric, Number(r.quantity)]));
    const metrics: UsageMetricSnapshot[] = (Object.keys(limits) as UsageMetric[]).map((metric) => {
      const quantity = byMetric.get(metric) ?? 0;
      const limit = limits[metric];
      const warnAt = usageWarningThreshold(limit);
      const percent = limit > 0 ? Math.round((quantity / limit) * 1000) / 10 : 0;
      return {
        metric,
        quantity,
        limit,
        warnAt,
        percent,
        atLimit: quantity >= limit,
        nearLimit: quantity >= warnAt && quantity < limit,
      };
    });
    const wa = metrics.find((m) => m.metric === UsageMetric.WHATSAPP_MESSAGES);
    return {
      periodKey,
      metrics,
      whatsappPaused: wa?.atLimit ?? false,
    };
  }
}