import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import {
  BillingInterval,
  CreditReason,
  KiorlyInvoiceStatus,
  PlanKey,
  PrismaClient,
  ReferralStatus,
  SubscriptionStatus,
} from "@prisma/client";
import { CreditWalletService } from "../credits/credit-wallet.service";
import { PrismaService } from "../prisma/prisma.service";
import { GrowthReferralService } from "./growth-referral.service";
import { ReferralCodeService } from "./referral-code.service";
import { ReferralRewardService } from "./referral-reward.service";

const prisma = new PrismaClient();

describe("CR-09 referral reward on first paid period", () => {
  const suffix = `cr09-${Date.now()}`;
  let referrerId: string;
  let referredId: string;
  let referralId: string;
  let invoiceId: string;
  let rewards: ReferralRewardService;
  let code: string;

  before(async () => {
    await prisma.$connect();
    const prismaSvc = prisma as unknown as PrismaService;
    rewards = new ReferralRewardService(prismaSvc, new CreditWalletService(prismaSvc));
    const codes = new ReferralCodeService(prismaSvc);

    const market = await prisma.market.findFirstOrThrow({ where: { code: "EG" } });
    const plan = await prisma.plan.findFirstOrThrow({ where: { key: PlanKey.PRO } });
    const price = await prisma.planPrice.findFirstOrThrow({
      where: { planId: plan.id, marketId: market.id, interval: BillingInterval.MONTHLY, validTo: null },
    });

    const referrer = await prisma.tenant.create({
      data: {
        name: `Ref ${suffix}`,
        marketId: market.id,
        deploymentCell: "frankfurt",
        baseCurrency: "EGP",
      },
    });
    referrerId = referrer.id;
    code = await codes.ensureForTenant(referrerId);

    const referred = await prisma.tenant.create({
      data: {
        name: `Referred ${suffix}`,
        marketId: market.id,
        deploymentCell: "frankfurt",
        baseCurrency: "EGP",
      },
    });
    referredId = referred.id;

    await prisma.subscription.create({
      data: {
        tenantId: referredId,
        planId: plan.id,
        planPriceId: price.id,
        status: SubscriptionStatus.ACTIVE,
        interval: BillingInterval.MONTHLY,
        clinicianSeats: 1,
        referralCodeUsed: code,
        currentPeriodStart: new Date("2027-01-01"),
        currentPeriodEnd: new Date("2027-02-01"),
      },
    });

    const ref = await prisma.referral.create({
      data: {
        code,
        referrerTenantId: referrerId,
        referredTenantId: referredId,
        status: ReferralStatus.PENDING,
      },
    });
    referralId = ref.id;

    const inv = await prisma.kiorlyInvoice.create({
      data: {
        tenantId: referredId,
        number: `KI-${suffix}`,
        status: KiorlyInvoiceStatus.ISSUED,
        currency: "EGP",
        subtotal: price.amount,
        tax: 0,
        total: price.amount,
        amountPaid: 0,
        periodKey: "2027-01",
        periodStart: new Date("2027-01-01"),
        periodEnd: new Date("2027-02-01"),
        dueAt: new Date("2027-01-15"),
      },
    });
    invoiceId = inv.id;

    await prisma.kiorlyInvoice.update({
      where: { id: invoiceId },
      data: { status: KiorlyInvoiceStatus.PAID, amountPaid: price.amount, paidAt: new Date() },
    });
  });

  after(async () => {
    for (const tid of [referredId, referrerId]) {
      if (!tid) continue;
      await prisma.creditLedgerEntry.deleteMany({ where: { wallet: { tenantId: tid } } });
      await prisma.creditWallet.deleteMany({ where: { tenantId: tid } });
      await prisma.auditLog.deleteMany({ where: { tenantId: tid } });
    }
    if (referralId) await prisma.referral.deleteMany({ where: { id: referralId } });
    if (invoiceId) await prisma.kiorlyInvoice.deleteMany({ where: { id: invoiceId } });
    if (referrerId) {
      await prisma.referralCode.deleteMany({ where: { tenantId: referrerId } });
      await prisma.tenant.deleteMany({ where: { id: { in: [referrerId, referredId].filter(Boolean) } } });
    }
    await prisma.$disconnect();
  });

  it("clinic.referral_rewards OFF: no new reward is granted (referral stays PENDING) and no new code is minted", async () => {
    const prismaSvc = prisma as unknown as PrismaService;
    const off = { evaluate: async () => ({ effective: false }) } as never;
    const gated = new ReferralRewardService(prismaSvc, new CreditWalletService(prismaSvc), off);
    await gated.tryOnInvoiceFullyPaid(referredId, invoiceId);
    assert.equal((await prisma.referral.findUniqueOrThrow({ where: { id: referralId } })).status, ReferralStatus.PENDING);
    assert.equal(await prisma.creditLedgerEntry.count({ where: { reason: CreditReason.REFERRAL, sourceRef: { contains: referralId } } }), 0);

    // Hub: a tenant with no code gets none while OFF (nothing is created); its existing code stays readable.
    const hub = new GrowthReferralService(prismaSvc, new ReferralCodeService(prismaSvc), off);
    const fresh = await prisma.tenant.create({
      data: { name: `NoCode ${suffix}`, marketId: (await prisma.market.findFirstOrThrow({ where: { code: "EG" } })).id, deploymentCell: "frankfurt", baseCurrency: "EGP" },
    });
    try {
      const res = await hub.getReferralHub({ userId: "u", tenantId: fresh.id } as never);
      assert.equal(res.enabled, false);
      assert.equal(res.code, null);
      assert.equal(res.link, null);
      assert.equal(await prisma.referralCode.count({ where: { tenantId: fresh.id } }), 0);
      const existing = await hub.getReferralHub({ userId: "u", tenantId: referrerId } as never);
      assert.equal(existing.code, code);
    } finally {
      await prisma.tenant.delete({ where: { id: fresh.id } }).catch(() => undefined);
    }
  });

  it("grants REFERRAL credits to both tenants once", async () => {
    await rewards.tryOnInvoiceFullyPaid(referredId, invoiceId);

    const refreshed = await prisma.referral.findUniqueOrThrow({ where: { id: referralId } });
    assert.equal(refreshed.status, ReferralStatus.REWARDED);

    const entries = await prisma.creditLedgerEntry.findMany({
      where: { reason: CreditReason.REFERRAL, sourceRef: { contains: referralId } },
    });
    assert.equal(entries.length, 2);

    await rewards.tryOnInvoiceFullyPaid(referredId, invoiceId);
    const again = await prisma.creditLedgerEntry.count({
      where: { reason: CreditReason.REFERRAL, sourceRef: { contains: referralId } },
    });
    assert.equal(again, 2);
  });
});