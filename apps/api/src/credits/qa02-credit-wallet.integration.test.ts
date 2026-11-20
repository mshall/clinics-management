import assert from "node:assert/strict";
import { config } from "dotenv";
import { resolve } from "node:path";
import { after, before, describe, it } from "node:test";
import {
  BillingInterval,
  CreditReason,
  PlanKey,
  PrismaClient,
  SubscriptionStatus,
  UserRole,
} from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../prisma/prisma.service";
import { CreditWalletService } from "./credit-wallet.service";
import { decimalAmount } from "./credit-wallet-math";
import { isPlatformSuperAdmin } from "../common/platform-super-admin";
import { createPrismaClient } from "../prisma/create-prisma-client";

config({ path: resolve(process.cwd(), ".env") });

const isCi = process.env.CI === "true";
const prisma = createPrismaClient();
const walletSvc = new CreditWalletService(prisma as unknown as PrismaService);

describe("QA-02 credit wallet money path", () => {
  const suffix = `qa02cw-${Date.now()}`;

  before(async () => {
    if (process.env.DATABASE_URL?.trim()) await prisma.$connect();
  });
  after(async () => {
    await prisma.$disconnect();
  });

  async function seedTenant() {
    const market = await prisma.market.findFirstOrThrow({ where: { code: "EG" } });
    const plan = await prisma.plan.findUniqueOrThrow({ where: { key: PlanKey.LITE } });
    const tenant = await prisma.tenant.create({
      data: {
        name: `Wallet ${suffix}`,
        nameAr: `Wallet ${suffix}`,
        baseCurrency: "EGP",
        marketId: market.id,
        deploymentCell: "frankfurt",
      },
    });
    await prisma.subscription.create({
      data: {
        tenantId: tenant.id,
        planId: plan.id,
        status: SubscriptionStatus.ACTIVE,
        interval: BillingInterval.MONTHLY,
        clinicianSeats: 1,
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
      },
    });
    return tenant;
  }

  it("getWalletView returns paginated ledger", async (t) => {
    if (!process.env.DATABASE_URL?.trim()) {
      t.skip("DATABASE_URL not set");
      return;
    }
    const tenant = await seedTenant();
    await walletSvc.grantInTransaction({
      tenantId: tenant.id,
      amount: decimalAmount(50),
      reason: CreditReason.GOODWILL,
      note: "seed",
    });
    const view = await walletSvc.getWalletView(tenant.id, 1, 5);
    assert.equal(view.page, 1);
    assert.ok(Number(view.balance) >= 50);
    assert.ok(view.entries.length >= 1);
  });

  it("grantManual requires platform super admin", async (t) => {
    if (!process.env.DATABASE_URL?.trim()) {
      t.skip("DATABASE_URL not set");
      return;
    }
    const tenant = await seedTenant();
    let platformUser = await prisma.user.findFirst({
      where: { role: UserRole.PLATFORM_SUPER_ADMIN },
      select: { id: true, email: true, role: true, additionalRoles: true, tenantId: true },
    });
    if (!platformUser) {
      platformUser = await prisma.user.create({
        data: {
          email: `plat-${suffix}@kiorly.test`,
          passwordHash: await bcrypt.hash("x", 8),
          role: UserRole.PLATFORM_SUPER_ADMIN,
          tenantId: null,
          displayName: "Platform",
        },
        select: { id: true, email: true, role: true, additionalRoles: true, tenantId: true },
      });
    }
    assert.ok(isPlatformSuperAdmin(platformUser));
    const res = await walletSvc.grantManual(
      {
        userId: platformUser.id,
        tenantId: null,
        email: platformUser.email,
        role: platformUser.role,
        additionalRoles: platformUser.additionalRoles ?? [],
      },
      tenant.id,
      { amount: 25, reason: CreditReason.GOODWILL, note: "manual QA-02 grant" },
    );
    assert.ok(res.entryId);
    assert.ok(Number(res.balance) >= 25);
  });

  it("runDailyCreditMaintenance expires past grants", async (t) => {
    if (!process.env.DATABASE_URL?.trim()) {
      t.skip("DATABASE_URL not set");
      return;
    }
    const tenant = await seedTenant();
    const yesterday = new Date(Date.now() - 86_400_000);
    await walletSvc.grantInTransaction({
      tenantId: tenant.id,
      amount: decimalAmount(40),
      reason: CreditReason.PROMO,
      expiresAt: yesterday,
      note: "expires",
    });
    const before = await prisma.creditWallet.findUniqueOrThrow({ where: { tenantId: tenant.id } });
    const result = await walletSvc.runDailyCreditMaintenance();
    assert.ok(result.expiredWallets >= 0);
    const after = await prisma.creditWallet.findUniqueOrThrow({ where: { tenantId: tenant.id } });
    assert.ok(after.balance.lt(before.balance));
  });
});