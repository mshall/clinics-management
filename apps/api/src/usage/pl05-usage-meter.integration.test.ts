import assert from "node:assert/strict";
import { ForbiddenException } from "@nestjs/common";
import { after, before, describe, it } from "node:test";
import { PrismaClient, UsageMetric } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { UsageMeterService } from "./usage-meter.service";
import { usageLimitsForPlan } from "./usage-limits";

const prisma = new PrismaClient();
const usage = new UsageMeterService(prisma as unknown as PrismaService);

describe("PL-05 usage metering", () => {
  before(async () => {
    await prisma.$connect();
  });

  after(async () => {
    await prisma.$disconnect();
  });

  it("incrementOnce is idempotent per sourceId (worker retry safe)", async () => {
    const tenant = await prisma.tenant.findFirstOrThrow({ select: { id: true } });
    const sourceId = `test-dedup-${Date.now()}`;
    const a = await usage.incrementOnce(tenant.id, UsageMetric.WHATSAPP_MESSAGES, sourceId);
    const b = await usage.incrementOnce(tenant.id, UsageMetric.WHATSAPP_MESSAGES, sourceId);
    assert.equal(a, true);
    assert.equal(b, false);
    const summary = await usage.summaryForTenant(tenant.id);
    const wa = summary.metrics.find((m) => m.metric === UsageMetric.WHATSAPP_MESSAGES);
    assert.ok(wa && wa.quantity >= 1);
  });

  it("assertWhatsAppQuota blocks when at plan limit", async () => {
    const tenant = await prisma.tenant.findFirstOrThrow({ select: { id: true } });
    const sub = await prisma.subscription.findUniqueOrThrow({
      where: { tenantId: tenant.id },
      include: { plan: true },
    });
    const limit = usageLimitsForPlan(sub.plan.key).WHATSAPP_MESSAGES;
    const periodKey = UsageMeterService.periodKey();
    await prisma.usageCounter.upsert({
      where: {
        tenantId_periodKey_metric: {
          tenantId: tenant.id,
          periodKey,
          metric: UsageMetric.WHATSAPP_MESSAGES,
        },
      },
      create: {
        tenantId: tenant.id,
        periodKey,
        metric: UsageMetric.WHATSAPP_MESSAGES,
        quantity: limit,
      },
      update: { quantity: limit },
    });
    await assert.rejects(
      () => usage.assertWhatsAppQuota(tenant.id),
      (e: unknown) =>
        e instanceof ForbiddenException &&
        (e.getResponse() as { code?: string }).code === "USAGE_QUOTA_EXCEEDED",
    );
    await prisma.usageCounter.update({
      where: {
        tenantId_periodKey_metric: {
          tenantId: tenant.id,
          periodKey,
          metric: UsageMetric.WHATSAPP_MESSAGES,
        },
      },
      data: { quantity: 0 },
    });
  });
});