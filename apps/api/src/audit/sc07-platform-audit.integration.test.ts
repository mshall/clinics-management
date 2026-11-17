import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { CreditReason, PrismaClient, UserRole } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { PlatformMoneyAuditService } from "./platform-money-audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { CreditWalletService } from "../credits/credit-wallet.service";
import { PlatformAdminService } from "../admin/platform-admin.service";
import { EntitlementsService } from "../entitlements/entitlements.service";
const prisma = new PrismaClient();
const prismaSvc = prisma as unknown as PrismaService;
const platformAudit = new PlatformMoneyAuditService(prismaSvc);
const creditWallet = new CreditWalletService(prismaSvc);

function platformAdminPartial(): PlatformAdminService {
  return new PlatformAdminService(
    prismaSvc,
    null as never,
    null as never,
    null as never,
    new EntitlementsService(prismaSvc),
    null as never,
    creditWallet,
    null as never,
  );
}

describe("SC-07 platform billing audit", () => {
  let platformUser: JwtUser;

  before(async () => {
    await prisma.$connect();
    const row = await prisma.user.findFirst({
      where: { role: UserRole.PLATFORM_SUPER_ADMIN },
      orderBy: { createdAt: "asc" },
    });
    assert.ok(row, "seed platform super admin required");
    platformUser = {
      userId: row.id,
      tenantId: null,
      email: row.email,
      role: UserRole.PLATFORM_SUPER_ADMIN,
    };
  });

  after(async () => {
    await prisma.$disconnect();
  });

  it("lists credit.grant after platform manual grant", async () => {
    const tenant = await prisma.tenant.findFirst({
      where: { market: { code: "EG" } },
      orderBy: { createdAt: "asc" },
    });
    assert.ok(tenant);

    await platformAdminPartial().grantTenantCredits(platformUser, tenant.id, {
      amount: 1.5,
      reason: CreditReason.ADJUSTMENT,
      note: "SC-07 audit list test",
    });

    const page = await platformAudit.list(platformUser, {
      entity: "credit",
      tenantId: tenant.id,
      page: "1",
      pageSize: "10",
    });
    assert.ok(page.items.some((r) => r.action === "credit.grant" && r.tenantId === tenant.id));
  });

  it("writes entitlement.override_set and filters entity=entitlement", async () => {
    const tenant = await prisma.tenant.findFirst({
      where: { subscription: { isNot: null } },
      orderBy: { createdAt: "asc" },
    });
    assert.ok(tenant);

    const key = `sc07_${Date.now()}`;
    await platformAdminPartial().putTenantEntitlementOverride(platformUser, tenant.id, key, {
      valueJson: true,
      reason: "SC-07 entitlement audit",
    });

    const page = await platformAudit.list(platformUser, {
      entity: "entitlement",
      tenantId: tenant.id,
      page: "1",
      pageSize: "20",
      q: "override_set",
    });
    assert.ok(
      page.items.some(
        (r) => r.action === "entitlement.override_set" && r.resource === "TenantEntitlementOverride",
      ),
    );
  });
});