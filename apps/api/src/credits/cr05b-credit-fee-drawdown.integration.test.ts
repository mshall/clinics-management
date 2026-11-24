import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { CreditEntryType, CreditReason, KiorlyLineType, Prisma } from "@prisma/client";
import { KiorlyInvoicesService } from "../billing-platform/kiorly-invoices.service";
import { KiorlyPaymentMethodsService } from "../billing-platform/kiorly-payment-methods.service";
import { KiorlyPaymentService } from "../billing-platform/kiorly-payment.service";
import { PaymentGatewayRegistry } from "../billing-platform/payment-gateways/payment-gateway.registry";
import { CommissionChargeService } from "../kiorex/commission-charge.service";
import { KiorexCommissionService } from "../kiorex/kiorex-commission.service";
import { createPrismaClient } from "../prisma/create-prisma-client";
import type { PrismaService } from "../prisma/prisma.service";
import { CreditFeeDrawdownService } from "./credit-fee-drawdown.service";
import { CreditGrantsService } from "./credit-grants.service";
import { CreditPromotionHoldService } from "./credit-promotion-hold.service";
import { CreditReconcileService } from "./credit-reconcile.service";
import { CreditStatementService } from "./credit-statement.service";
import { CreditWalletService } from "./credit-wallet.service";
import type { UsageBundle } from "./usage-bundles/usage-bundle.catalog";
import { UsageBundleService } from "./usage-bundles/usage-bundle.service";

/** GRW-P2-W: fee draw-down, dispute-win credit, connect bonus, promotion holds, usage bundle skeleton, statement and reconcile on a real database. */
const prisma = createPrismaClient();
const svc = prisma as unknown as PrismaService;
const wallet = new CreditWalletService(svc);
const gateways = new PaymentGatewayRegistry();
const payments = new KiorlyPaymentService(svc, gateways, new KiorlyPaymentMethodsService(svc, gateways), { reconcileAfterPayment: async () => {} } as never, { tryOnInvoiceFullyPaid: async () => {} } as never);
const invoices = new KiorlyInvoicesService(svc, wallet, payments, new CreditFeeDrawdownService(wallet));
const D = (n: number | string) => new Prisma.Decimal(String(n));
const flagsOn = { evaluate: async () => ({ effective: true, scope: "global" }) } as never;
const flagsOff = { evaluate: async () => ({ effective: false, scope: "global" }) } as never;
const inDays = (n: number) => new Date(Date.now() + n * 86_400_000);

describe("GRW-P2-W provider credit v2", () => {
  const suffix = `cr05b-${Date.now()}`;
  let marketId = "";
  before(async () => {
    await prisma.$connect();
    const m = await prisma.market.create({
      data: { code: `CB${randomUUID().replace(/-/g, "").slice(0, 8)}`, nameEn: `CR05B ${suffix}`, hostCell: "frankfurt", defaultCurrency: "EGP", defaultLocale: "en", defaultTimezone: "Africa/Cairo", weekendDays: [5, 6], enabledLanguages: ["en", "ar"], defaultPhoneRegion: "EG",
        featureDefaults: { credit: { connectBonusAmount: 250, onboardingAmount: 100, promotionalExpiryMonths: 6, usageBundlesEnabled: true } } },
    });
    marketId = m.id;
  });
  after(async () => { await prisma.$disconnect(); });

  async function tenant(label: string) {
    return prisma.tenant.create({ data: { name: `${label} ${suffix}`, nameAr: `${label} ${suffix}`, baseCurrency: "EGP", marketId, deploymentCell: "frankfurt" } });
  }
  const balance = async (tenantId: string) => (await prisma.creditWallet.findUniqueOrThrow({ where: { tenantId } })).balance.toFixed(2);
  const entries = async (tenantId: string) => prisma.creditLedgerEntry.findMany({ where: { wallet: { tenantId } }, orderBy: { createdAt: "asc" } });
  async function draft(tenantId: string, lines: { type: KiorlyLineType; amount: number }[], creditsApplied: number, periodKey: string) {
    return invoices.createDraft(tenantId, {
      periodKey, periodStart: new Date("2026-10-01T00:00:00Z"), periodEnd: new Date("2026-11-01T00:00:00Z"), currency: "EGP", creditsApplied,
      lines: lines.map((l) => ({ type: l.type, descEn: l.type, descAr: l.type, quantity: 1, unitAmount: l.amount, amount: l.amount })),
    });
  }

  it("a 999 credit and a billed commission of 400: the invoice is 0 and the ledger shows one fee offset tied to the invoice", async () => {
    const t = await tenant("Draw1");
    await wallet.grantInTransaction({ tenantId: t.id, amount: D(999), reason: CreditReason.GOODWILL });
    const inv = await draft(t.id, [{ type: KiorlyLineType.KIOREX_COMMISSION, amount: 400 }], 400, `${suffix}-1`);
    assert.equal(inv.total, "0.00");
    await invoices.issue(t.id, inv.id);
    const consumes = (await entries(t.id)).filter((e) => e.type === CreditEntryType.CONSUME);
    assert.equal(consumes.length, 1);
    assert.equal(consumes[0].reason, CreditReason.KIOREX_FEE_OFFSET);
    assert.equal(consumes[0].invoiceId, inv.id);
    assert.equal(consumes[0].idempotencyKey, `invoice:${inv.id}:credit:KIOREX_FEES`);
    assert.equal(await balance(t.id), "599.00");
  });

  it("commission and subscription are drawn separately, first-expiring lot first; replay of the draw-down consumes once", async () => {
    const t = await tenant("Draw2");
    await wallet.grantInTransaction({ tenantId: t.id, amount: D(60), reason: CreditReason.GOODWILL, expiresAt: inDays(200) });
    const soon = await wallet.grantInTransaction({ tenantId: t.id, amount: D(100), reason: CreditReason.PROMO, expiresAt: inDays(20) });
    const inv = await draft(t.id, [{ type: KiorlyLineType.SUBSCRIPTION, amount: 300 }, { type: KiorlyLineType.KIOREX_COMMISSION, amount: 400 }, { type: KiorlyLineType.KIOREX_COMMISSION_OFFSET, amount: -300 }], 150, `${suffix}-2`);
    await invoices.issue(t.id, inv.id);
    const consumes = (await entries(t.id)).filter((e) => e.type === CreditEntryType.CONSUME);
    assert.deepEqual(consumes.map((c) => [c.reason, c.amount.toFixed(2)]).sort(), [[CreditReason.KIOREX_FEE_OFFSET, "-100.00"], [CreditReason.SUBSCRIPTION_OFFSET, "-50.00"]].sort());
    assert.equal((await prisma.creditLedgerEntry.findUniqueOrThrow({ where: { id: soon.id } })).remaining?.toFixed(2), "0.00"); // the first-expiring lot went first
    const dd = new CreditFeeDrawdownService(wallet);
    await dd.consumeForInvoice(t.id, { id: inv.id, number: inv.number, creditsApplied: D(150) }, [{ type: KiorlyLineType.SUBSCRIPTION, amount: 300 }, { type: KiorlyLineType.KIOREX_COMMISSION, amount: 400 }, { type: KiorlyLineType.KIOREX_COMMISSION_OFFSET, amount: -300 }]);
    assert.equal(await balance(t.id), "10.00"); // 160 - 150, not 160 - 300
  });

  it("flag clinic.provider_credit_v2 OFF keeps today's single ADJUSTMENT consume", async () => {
    const t = await tenant("DrawOff");
    await wallet.grantInTransaction({ tenantId: t.id, amount: D(80), reason: CreditReason.GOODWILL });
    const dd = new CreditFeeDrawdownService(wallet, flagsOff);
    await dd.consumeForInvoice(t.id, { id: `inv-${suffix}`, number: "N", creditsApplied: D(50) }, [{ type: KiorlyLineType.KIOREX_COMMISSION, amount: 50 }]);
    const c = (await entries(t.id)).filter((e) => e.type === CreditEntryType.CONSUME);
    assert.deepEqual(c.map((x) => x.reason), [CreditReason.ADJUSTMENT]);
    assert.equal(c[0].idempotencyKey, null);
  });

  it("a dispute win on a billed charge returns credit exactly once under replay and concurrency; the waiver path is goodwill", async () => {
    const t = await tenant("Dispute");
    const grants = new CreditGrantsService(svc, wallet);
    const charges = new CommissionChargeService(svc, new KiorexCommissionService(svc), { enqueue: async () => undefined } as never, wallet);
    const intent = { tenantId: t.id, amount: D(40), chargeId: `ch_${suffix}`, appointmentId: "apt1", reason: "dispute_approved" };
    await Promise.all([charges.grantLateReversalCredit(intent), charges.grantLateReversalCredit(intent), charges.grantLateReversalCredit(intent)]);
    await charges.grantLateReversalCredit(intent);
    const g = (await entries(t.id)).filter((e) => e.type === CreditEntryType.GRANT);
    assert.equal(g.length, 1);
    assert.equal(g[0].reason, CreditReason.DISPUTE_WIN);
    assert.equal(g[0].category, "SERVICE_RECOVERY");
    assert.ok(g[0].expiresAt, "W-4: every non-adjustment grant expires");
    assert.equal(await balance(t.id), "40.00");
    await grants.grantWaiver(t.id, `ch2_${suffix}`, D(10), "apt2", "GOODWILL_WAIVER");
    await grants.grantWaiver(t.id, `ch2_${suffix}`, D(10), "apt2", "GOODWILL_WAIVER");
    assert.equal(await balance(t.id), "50.00");
    await charges.grantLateReversalCredit({ ...intent, chargeId: `ch3_${suffix}`, reason: "override_goodwill_waiver" });
    assert.ok((await entries(t.id)).some((e) => e.reason === CreditReason.GOODWILL));
  });

  it("connect bonus and onboarding credit are granted once per organisation, from the market config, with an expiry", async () => {
    const t = await tenant("Connect");
    const grants = new CreditGrantsService(svc, wallet);
    await Promise.all([grants.grantConnectBonus(t.id), grants.grantConnectBonus(t.id), grants.grantConnectBonus(t.id)]);
    await grants.grantConnectBonus(t.id);
    await grants.grantOnboarding(t.id);
    await grants.grantOnboarding(t.id);
    const g = await entries(t.id);
    assert.deepEqual(g.map((e) => e.reason).sort(), [CreditReason.CONNECT_BONUS, CreditReason.ONBOARDING]);
    assert.equal(await balance(t.id), "350.00");
    const months = (g[0].expiresAt!.getTime() - g[0].createdAt.getTime()) / 86_400_000;
    assert.ok(months > 170 && months < 190, `6-month market expiry, got ${months} days`);
    // a market without amounts grants nothing (prices are NEEDS_HUMAN)
    const eg = await prisma.market.findFirstOrThrow({ where: { code: "EG" } });
    const plain = await prisma.tenant.create({ data: { name: `Plain ${suffix}`, nameAr: `Plain ${suffix}`, baseCurrency: "EGP", marketId: eg.id, deploymentCell: "frankfurt" } });
    assert.equal(await grants.grantConnectBonus(plain.id), null);
  });

  it("expiry sweep removes lapsed credit and Sigma ledger = balance = Sigma remaining after the daily job", async () => {
    const t = await tenant("Expire");
    await wallet.grantInTransaction({ tenantId: t.id, amount: D(70), reason: CreditReason.GOODWILL, expiresAt: inDays(5) });
    await prisma.$executeRaw`UPDATE "CreditLedgerEntry" SET "expiresAt" = now() - interval '1 day' WHERE "walletId" = (SELECT id FROM "CreditWallet" WHERE "tenantId" = ${t.id})`.catch(() => undefined);
    // the append-only trigger refuses that edit: expiry is fixed at grant time
    assert.equal((await entries(t.id))[0].expiresAt! > new Date(), true);
    const past = await wallet.grantInTransaction({ tenantId: t.id, amount: D(30), reason: CreditReason.ADJUSTMENT, expiresAt: new Date(Date.now() - 1000) });
    assert.ok(past.id);
    const report = await new CreditReconcileService(svc, wallet).run();
    assert.equal(report.details.filter((d) => d.tenantId === t.id).length, 0);
    assert.equal(await balance(t.id), "70.00");
    const ledger = await prisma.creditLedgerEntry.aggregate({ where: { wallet: { tenantId: t.id } }, _sum: { amount: true } });
    assert.equal(ledger._sum.amount?.toFixed(2), "70.00");
    const run = await prisma.creditReconcileRun.findFirstOrThrow({ orderBy: { ranAt: "desc" } });
    assert.ok(run.wallets >= 1);
  });

  it("concurrent consumes never overdraw: five parallel 30s against 100", async () => {
    const t = await tenant("Conc");
    await wallet.grantInTransaction({ tenantId: t.id, amount: D(100), reason: CreditReason.GOODWILL });
    const res = await Promise.allSettled([1, 2, 3, 4, 5].map((i) => wallet.consume(t.id, 30, CreditReason.KIOREX_FEE_OFFSET, { idempotencyKey: `c${i}:${suffix}` })));
    assert.equal(res.filter((r) => r.status === "fulfilled").length, 3);
    assert.equal(await balance(t.id), "10.00");
    const ledger = await prisma.creditLedgerEntry.aggregate({ where: { wallet: { tenantId: t.id } }, _sum: { amount: true } });
    assert.equal(ledger._sum.amount?.toFixed(2), "10.00");
  });

  it("promotion holds: reserve at booking, debit at completion, release on cancel, reverse after a refund, each once", async () => {
    const t = await tenant("Promo");
    const holds = new CreditPromotionHoldService(svc, wallet);
    await wallet.grantInTransaction({ tenantId: t.id, amount: D(150), reason: CreditReason.PROMO });
    await wallet.grantInTransaction({ tenantId: t.id, amount: D(500), reason: CreditReason.REFERRAL }); // referral credit cannot fund promotions
    const a = await holds.reserve(t.id, { promotionRef: "p1", holdRef: "h1", amount: 100 });
    assert.equal(a.state, "RESERVED");
    assert.equal((await holds.reserve(t.id, { promotionRef: "p1", holdRef: "h1", amount: 100 })).id, a.id); // replay
    await assert.rejects(() => holds.reserve(t.id, { promotionRef: "p1", holdRef: "h2", amount: 100 }), /Not enough promotion credit/);
    assert.equal((await holds.available(t.id)).available.toFixed(2), "50.00");
    assert.equal(await balance(t.id), "650.00"); // a reservation does not touch the balance
    const d1 = await holds.debit(t.id, { promotionRef: "p1", holdRef: "h1" });
    const d2 = await holds.debit(t.id, { promotionRef: "p1", holdRef: "h1" });
    assert.equal(d1.state, "DEBITED"); assert.equal(d2.debitedAmount, "100.00"); assert.equal(d1.shortfall, "0.00");
    assert.equal(await balance(t.id), "550.00");
    const consumes = (await entries(t.id)).filter((e) => e.reason === CreditReason.SPONSORED_PROMOTION);
    assert.equal(consumes.length, 1);
    assert.equal(consumes[0].sourceRef, "promotion:p1");
    const r1 = await holds.reverse(t.id, { promotionRef: "p1", holdRef: "h1" });
    await holds.reverse(t.id, { promotionRef: "p1", holdRef: "h1" });
    assert.equal(r1?.state, "REVERSED");
    assert.equal((await entries(t.id)).filter((e) => e.reason === CreditReason.SPONSORED_PROMOTION_REVERSAL).length, 1);
    assert.equal(await balance(t.id), "650.00");
    // release path
    await holds.reserve(t.id, { promotionRef: "p2", holdRef: "h9", amount: 40 });
    assert.equal((await holds.release(t.id, { promotionRef: "p2", holdRef: "h9" }))?.state, "RELEASED");
    await assert.rejects(() => holds.debit(t.id, { promotionRef: "p2", holdRef: "h9" }), (e: { response?: { code?: string } }) => e.response?.code === "RESERVATION_NOT_DEBITABLE");
    assert.equal((await holds.available(t.id)).reserved.toFixed(2), "0.00");
    // W-8: a reference that names a patient ledger object is refused
    await assert.rejects(() => holds.reserve(t.id, { promotionRef: "reward:1", holdRef: "h", amount: 1 }), /patient ledger/);
  });

  it("a debit takes what is spendable and records the shortfall for the invoice line", async () => {
    const t = await tenant("Short");
    const holds = new CreditPromotionHoldService(svc, wallet);
    await wallet.grantInTransaction({ tenantId: t.id, amount: D(100), reason: CreditReason.GOODWILL });
    await holds.reserve(t.id, { promotionRef: "p3", holdRef: "h1", amount: 80 });
    await wallet.consume(t.id, 60, CreditReason.KIOREX_FEE_OFFSET, { idempotencyKey: `x:${suffix}` }); // fees were paid from the same credit meanwhile
    const d = await holds.debit(t.id, { promotionRef: "p3", holdRef: "h1" });
    assert.equal(d.debitedAmount, "40.00");
    assert.equal(d.shortfall, "40.00");
    assert.equal(await balance(t.id), "0.00");
  });

  it("flag clinic.provider_credit_v2 OFF: holds are refused with FEATURE_DISABLED", async () => {
    const t = await tenant("PromoOff");
    await assert.rejects(() => new CreditPromotionHoldService(svc, wallet, flagsOff).reserve(t.id, { promotionRef: "p", holdRef: "h", amount: 1 }), /unavailable|FEATURE_DISABLED/);
  });

  it("usage bundle skeleton: OFF refuses, ON buys from credit with one consume and one unit grant, replay buys nothing", async () => {
    const t = await tenant("Bundle");
    await wallet.grantInTransaction({ tenantId: t.id, amount: D(100), reason: CreditReason.GOODWILL });
    const catalog: UsageBundle[] = [{ key: "sms-t", unit: "SMS", units: 100, priceCredit: 30, labelEn: "t", labelAr: "ت" }];
    await assert.rejects(() => new UsageBundleService(svc, wallet, flagsOff, catalog).purchase(t.id, "sms-t", "k1"), /unavailable|FEATURE_DISABLED/);
    const on = new UsageBundleService(svc, wallet, flagsOn, catalog);
    const p1 = await on.purchase(t.id, "sms-t", "k1");
    const p2 = await on.purchase(t.id, "sms-t", "k1");
    assert.equal(p1.replay, false); assert.equal(p2.replay, true);
    assert.deepEqual(p1.units, { SMS: 100 });
    assert.equal(await balance(t.id), "70.00");
    const e = (await entries(t.id)).filter((x) => x.reason === CreditReason.USAGE_PURCHASE);
    assert.equal(e.length, 1);
    const unit = await prisma.usageUnitLedger.findMany({ where: { tenantId: t.id } });
    assert.equal(unit.length, 1);
    assert.equal(unit[0].purchaseEntryId, e[0].id);
    await assert.rejects(() => on.purchase(t.id, "nope", "k2"), /Unknown bundle/);
    // the market has not enabled bundles: a plain EG tenant is refused even with the flag ON
    const eg = await prisma.market.findFirstOrThrow({ where: { code: "EG" } });
    const plain = await prisma.tenant.create({ data: { name: `PlainB ${suffix}`, nameAr: `PlainB ${suffix}`, baseCurrency: "EGP", marketId: eg.id, deploymentCell: "frankfurt" } });
    await assert.rejects(() => on.purchase(plain.id, "sms-t", "k3"), /unavailable|FEATURE_DISABLED/);
  });

  it("the statement credit section reconciles to the ledger and the wallet", async () => {
    const t = await tenant("Stmt");
    await wallet.grantInTransaction({ tenantId: t.id, amount: D(300), reason: CreditReason.ONBOARDING });
    await wallet.consume(t.id, 120, CreditReason.KIOREX_FEE_OFFSET, { idempotencyKey: `s1:${suffix}` });
    const now = new Date();
    const key = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    const s = await new CreditStatementService(svc).sectionForPeriod(t.id, key);
    assert.ok(s);
    assert.equal(s.reconciles, true);
    assert.equal(s.closing, await balance(t.id));
    assert.equal(s.grantsByReason.ONBOARDING, "300.00");
    assert.equal(s.consumptionByUse.KIOREX_FEES, "120.00");
  });
});
