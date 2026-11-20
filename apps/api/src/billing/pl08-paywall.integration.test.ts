import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { PrismaClient } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { BillingController } from "./billing.controller";
import { createPrismaClient } from "../prisma/create-prisma-client";

const prisma = createPrismaClient();

describe("PL-08 paywall events", () => {
  let tenantId: string;
  let userId: string;

  before(async () => {
    await prisma.$connect();
    const market = await prisma.market.findFirstOrThrow({ where: { code: "EG" } });
    const suffix = `pl08-${Date.now()}`;
    const tenant = await prisma.tenant.create({
      data: { name: `PL08 ${suffix}`, marketId: market.id, deploymentCell: "frankfurt", baseCurrency: "EGP" },
    });
    tenantId = tenant.id;
    const user = await prisma.user.create({
      data: {
        tenantId,
        email: `pl08-${suffix}@test.com`,
        passwordHash: "x",
        displayName: "Owner",
        role: "GROUP_ADMIN",
        isTenantOwner: true,
      },
    });
    userId = user.id;
  });

  after(async () => {
    if (tenantId) {
      await prisma.auditLog.deleteMany({ where: { tenantId } });
      await prisma.user.deleteMany({ where: { tenantId } });
      await prisma.tenant.delete({ where: { id: tenantId } });
    }
    await prisma.$disconnect();
  });

  it("writes paywall.view audit row", async () => {
    const ctrl = new BillingController(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      prisma as unknown as PrismaService,
    );
    await ctrl.recordPaywallEvent(
      { userId, tenantId, role: "GROUP_ADMIN", email: "x@test.com" },
      { type: "view", entitlement: "mod_reports", requiredPlan: "PRO", source: "/api/v1/reports/x" },
    );
    const row = await prisma.auditLog.findFirst({
      where: { tenantId, action: "paywall.view" },
      orderBy: { createdAt: "desc" },
    });
    assert.ok(row);
    const meta = row.metadata as Record<string, unknown>;
    assert.equal(meta.entitlement, "mod_reports");
  });
});