import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { PrismaClient, UserRole } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { JwtUser } from "../auth/jwt-user";
import { CommercialConfigService } from "./commercial-config.service";
import { DEFAULT_COMMERCIAL_CONFIG } from "./commercial-config.schema";
import { dunningTimelineFromFeatureDefaults } from "../subscriptions/dunning-config";
import { createPrismaClient } from "../prisma/create-prisma-client";

const prisma = createPrismaClient();
const prismaSvc = prisma as unknown as PrismaService;
const commercial = new CommercialConfigService(prismaSvc);

const platformUser = {
  userId: "platform-test",
  tenantId: null,
  email: "platform-test@kiorly.com",
  role: UserRole.PLATFORM_SUPER_ADMIN,
} as JwtUser;

describe("PA-02 commercial config API service", () => {
  before(async () => {
    await prisma.$connect();
  });
  after(async () => {
    await prisma.$disconnect();
  });

  it("persists valid config, writes audit, and updates effective featureDefaults", async () => {
    const market = await prisma.market.create({
      data: {
        code: `PA02-${Date.now()}`,
        nameEn: "PA-02 test",
        hostCell: "frankfurt",
        defaultCurrency: "EGP",
        defaultTimezone: "Africa/Cairo",
        defaultLocale: "en-EG",
        defaultPhoneRegion: "EG",
        weekendDays: [5, 6],
        enabledLanguages: ["en", "ar"],
      },
    });
    const next = {
      ...DEFAULT_COMMERCIAL_CONFIG,
      dunning: { graceDays: 11, readOnlyAfterDays: 22, suspendAfterDays: 55 },
    };

    const suffix = Date.now();
    await prisma.tenant.create({
      data: {
        name: `PA02 anchor ${suffix}`,
        nameAr: "اختبار",
        marketId: market.id,
        baseCurrency: "EGP",
        deploymentCell: "frankfurt",
      },
    });

    const auditBefore = await prisma.auditLog.count({
      where: { action: "market.commercial_config_updated", resourceId: market.id },
    });

    const result = await commercial.update(platformUser, market.id, next);
    assert.equal(result.config.dunning.graceDays, 11);
    assert.ok(result.preview.changedKeys.includes("dunning"));

    const reloaded = await prisma.market.findUniqueOrThrow({ where: { id: market.id } });
    const dunning = dunningTimelineFromFeatureDefaults(reloaded.featureDefaults);
    assert.equal(dunning.graceEndDay, 11);
    assert.equal(dunning.readOnlyFromDay, 22);

    const auditAfter = await prisma.auditLog.count({
      where: { action: "market.commercial_config_updated", resourceId: market.id },
    });
    assert.ok(auditAfter > auditBefore);

    await prisma.market.delete({ where: { id: market.id } });
  });

  it("rejects invalid config at parse time", async () => {
    const market = await prisma.market.create({
      data: {
        code: `PA02X-${Date.now()}`,
        nameEn: "PA-02 invalid",
        hostCell: "frankfurt",
        defaultCurrency: "EGP",
        defaultTimezone: "Africa/Cairo",
        defaultLocale: "en-EG",
        defaultPhoneRegion: "EG",
        weekendDays: [5, 6],
        enabledLanguages: ["en", "ar"],
      },
    });
    await assert.rejects(
      () =>
        commercial.update(platformUser as never, market.id, {
          ...DEFAULT_COMMERCIAL_CONFIG,
          kiorex: { ...DEFAULT_COMMERCIAL_CONFIG.kiorex, benchmarkTargetRatio: 99 },
        }),
      /COMMERCIAL_CONFIG_INVALID|Bad Request/,
    );
    await prisma.market.delete({ where: { id: market.id } });
  });
});