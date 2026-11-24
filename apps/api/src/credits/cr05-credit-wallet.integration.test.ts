import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { BillingInterval, CreditReason, PlanKey, Prisma, PrismaClient, SubscriptionStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CreditWalletService } from "./credit-wallet.service";
import { decimalAmount, sumLedgerAmounts } from "./credit-wallet-math";
import { createPrismaClient } from "../prisma/create-prisma-client";
import { OutboxEventService } from "../messaging/outbox-event.service";

const prisma = createPrismaClient();
const walletSvc = new CreditWalletService(prisma as unknown as PrismaService);
const walletWithEvents = new CreditWalletService(prisma as unknown as PrismaService, new OutboxEventService(prisma as unknown as PrismaService));

describe("CR-05 credit wallet service", () => {
  const suffix = `cr05-${Date.now()}`;

  before(async () => {
    await prisma.$connect();
  });
  after(async () => {
    await prisma.$disconnect();
  });

  async function seedTenant(label: string) {
    const market = await prisma.market.findFirstOrThrow({ where: { code: "EG" } });
    const plan = await prisma.plan.findUniqueOrThrow({ where: { key: PlanKey.LITE } });
    const tenant = await prisma.tenant.create({
      data: {
        name: `Credits ${label} ${suffix}`,
        nameAr: `Credits ${label} ${suffix}`,
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

  it("provider credit events (contracts 1.12.0) are written INTERNAL in the ledger transaction: granted, consumed, expired; tenant, category, reason and amount only", async () => {
    const tenant = await seedTenant("events");
    await walletWithEvents.grantInTransaction({ tenantId: tenant.id, amount: decimalAmount(40), reason: CreditReason.PROMO, note: "promo", expiresAt: new Date(Date.now() + 86_400_000) });
    await walletWithEvents.consume(tenant.id, 15, CreditReason.KIOREX_FEE_OFFSET, { untyped: true });
    await walletWithEvents.grantInTransaction({ tenantId: tenant.id, amount: decimalAmount(10), reason: CreditReason.PROMO, expiresAt: new Date(Date.now() - 1000) });
    await walletWithEvents.runDailyCreditMaintenance();
    const rows = await prisma.outboxEvent.findMany({ where: { tenantId: tenant.id, type: { startsWith: "ProviderCredit" } }, orderBy: { createdAt: "asc" } });
    assert.deepEqual(rows.map((r) => r.type), ["ProviderCreditGranted", "ProviderCreditConsumed", "ProviderCreditGranted", "ProviderCreditExpired"]);
    for (const r of rows) {
      assert.equal(r.target, "INTERNAL");
      const p = r.payload as Record<string, unknown>;
      assert.equal(p.orgRef, tenant.id);
      assert.ok(Number.isInteger(p.amountMinor) && (p.amountMinor as number) >= 1);
      assert.doesNotMatch(Object.keys(p).join(" "), /patient|name|phone|email|sub\b/i);
    }
    assert.equal((rows[0]!.payload as { amountMinor: number }).amountMinor, 4000);
    assert.equal((rows[1]!.payload as { amountMinor: number }).amountMinor, 1500);
  });

  it("grant + consume keeps ledger sum equal to wallet balance", async () => {
    const tenant = await seedTenant("ledger");
    await walletSvc.grantInTransaction({
      tenantId: tenant.id,
      amount: decimalAmount(100),
      reason: CreditReason.PROMO,
      note: "promo",
    });
    await walletSvc.grantInTransaction({
      tenantId: tenant.id,
      amount: decimalAmount(50),
      reason: CreditReason.REFERRAL,
      expiresAt: new Date("2030-01-01T00:00:00.000Z"),
      note: "referral",
    });
    await walletSvc.consume(tenant.id, 40, CreditReason.DOWNGRADE_PRORATION, { note: "apply" });

    const wallet = await prisma.creditWallet.findUniqueOrThrow({ where: { tenantId: tenant.id } });
    const rows = await prisma.creditLedgerEntry.findMany({ where: { walletId: wallet.id } });
    const sum = sumLedgerAmounts(rows);
    assert.ok(wallet.balance.eq(sum));
    assert.ok(wallet.balance.eq(new Prisma.Decimal(110)));
  });

  it("concurrent consumption on the same wallet never drives balance negative", async () => {
    const tenant = await seedTenant("concurrent");
    await walletSvc.grantInTransaction({
      tenantId: tenant.id,
      amount: decimalAmount(100),
      reason: CreditReason.GOODWILL,
      note: "seed",
    });

    const results = await Promise.allSettled([
      walletSvc.consume(tenant.id, 70, CreditReason.ADJUSTMENT, { note: "a" }),
      walletSvc.consume(tenant.id, 70, CreditReason.ADJUSTMENT, { note: "b" }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    assert.equal(fulfilled.length, 1, "exactly one consume should succeed");
    assert.equal(rejected.length, 1, "second consume should fail");

    const wallet = await prisma.creditWallet.findUniqueOrThrow({ where: { tenantId: tenant.id } });
    assert.ok(wallet.balance.gte(0));
    assert.ok(wallet.balance.lte(new Prisma.Decimal(100)));
    const rows = await prisma.creditLedgerEntry.findMany({ where: { walletId: wallet.id } });
    assert.ok(sumLedgerAmounts(rows).eq(wallet.balance));
  });
});