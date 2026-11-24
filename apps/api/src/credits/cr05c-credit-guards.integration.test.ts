import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { CreditReason, Prisma, UserRole } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { createPrismaClient } from "../prisma/create-prisma-client";
import type { PrismaService } from "../prisma/prisma.service";
import { CreditStatementService } from "./credit-statement.service";
import { CreditWalletService } from "./credit-wallet.service";
import { CreditsController } from "./credits.controller";
import { UsageBundleService } from "./usage-bundles/usage-bundle.service";

/** GRW-P2-W hard rules W-1 to W-8 against the real database: trigger rejections, idempotency, cross-tenant matrix. */
const prisma = createPrismaClient();
const svc = prisma as unknown as PrismaService;
const wallet = new CreditWalletService(svc);
const controller = new CreditsController(wallet, new CreditStatementService(svc), new UsageBundleService(svc, wallet));
const D = (n: number) => new Prisma.Decimal(String(n));
const user = (tenantId: string, role: UserRole, owner = false): JwtUser => ({ userId: "u1", tenantId, email: "a@b.c", role, isTenantOwner: owner });

describe("GRW-P2-W guards W-1 to W-8", () => {
  const suffix = `cr05c-${Date.now()}`;
  let a = ""; let b = "";
  before(async () => {
    await prisma.$connect();
    const market = await prisma.market.findFirstOrThrow({ where: { code: "EG" } });
    const mk = (n: string) => prisma.tenant.create({ data: { name: `${n} ${suffix}`, nameAr: `${n} ${suffix}`, baseCurrency: "EGP", marketId: market.id, deploymentCell: "frankfurt" } });
    a = (await mk("A")).id; b = (await mk("B")).id;
    await wallet.grantInTransaction({ tenantId: a, amount: D(100), reason: CreditReason.GOODWILL, note: "seed" });
    await wallet.grantInTransaction({ tenantId: b, amount: D(7), reason: CreditReason.GOODWILL, note: "seed" });
  });
  after(async () => { await prisma.$disconnect(); });

  const entryOf = async (tenantId: string) => prisma.creditLedgerEntry.findFirstOrThrow({ where: { wallet: { tenantId } } });

  it("W-5: the database refuses to change any ledger column except remaining, and to delete a row", async () => {
    const e = await entryOf(a);
    for (const data of [{ amount: D(1) }, { note: "edited" }, { reason: CreditReason.PROMO }, { expiresAt: new Date() }, { idempotencyKey: "x" }, { sourceRef: "y" }, { category: "PROMOTIONAL" as const }]) {
      await assert.rejects(() => prisma.creditLedgerEntry.update({ where: { id: e.id }, data }), /append-only/, JSON.stringify(data));
    }
    await assert.rejects(() => prisma.creditLedgerEntry.delete({ where: { id: e.id } }), /append-only/);
    await assert.rejects(() => prisma.creditLedgerEntry.deleteMany({ where: { walletId: e.walletId } }), /append-only/);
    const ok = await prisma.creditLedgerEntry.update({ where: { id: e.id }, data: { remaining: e.remaining } }); // the FIFO cache may change
    assert.equal(ok.id, e.id);
  });

  it("W-5: closing a tenant (wallet cascade) is the only way rows leave", async () => {
    const market = await prisma.market.findFirstOrThrow({ where: { code: "EG" } });
    const t = await prisma.tenant.create({ data: { name: `C ${suffix}`, nameAr: `C ${suffix}`, baseCurrency: "EGP", marketId: market.id, deploymentCell: "frankfurt" } });
    await wallet.grantInTransaction({ tenantId: t.id, amount: D(5), reason: CreditReason.PROMO });
    await prisma.creditWallet.delete({ where: { tenantId: t.id } });
    assert.equal(await prisma.creditLedgerEntry.count({ where: { wallet: { tenantId: t.id } } }), 0);
  });

  it("W-6: (walletId, idempotencyKey) is unique at the database and a replay returns the first entry", async () => {
    const one = await wallet.grantInTransaction({ tenantId: a, amount: D(10), reason: CreditReason.GOODWILL, idempotencyKey: `k1:${suffix}` });
    const two = await wallet.grantInTransaction({ tenantId: a, amount: D(999), reason: CreditReason.GOODWILL, idempotencyKey: `k1:${suffix}` });
    assert.equal(one.id, two.id);
    assert.equal(two.amount.toFixed(2), "10.00");
    await assert.rejects(() => prisma.creditLedgerEntry.create({ data: { walletId: one.walletId, type: "GRANT", reason: "GOODWILL", amount: D(1), idempotencyKey: `k1:${suffix}` } }), /Unique constraint/);
    const c1 = await wallet.consume(a, 5, CreditReason.KIOREX_FEE_OFFSET, { idempotencyKey: `kc:${suffix}` });
    const c2 = await wallet.consume(a, 5, CreditReason.KIOREX_FEE_OFFSET, { idempotencyKey: `kc:${suffix}` });
    assert.equal(c1.id, c2.id);
  });

  it("W-4: every grant expires except an explicit ADJUSTMENT; a promotional category can never be non-expiring", async () => {
    const g = await wallet.grantInTransaction({ tenantId: a, amount: D(1), reason: CreditReason.PROMO });
    assert.ok(g.expiresAt);
    const adj = await wallet.grantInTransaction({ tenantId: a, amount: D(1), reason: CreditReason.ADJUSTMENT, note: "support correction" });
    assert.equal(adj.expiresAt, null);
    const promoAdj = await wallet.grantInTransaction({ tenantId: a, amount: D(1), reason: CreditReason.ADJUSTMENT, category: "PROMOTIONAL" });
    assert.ok(promoAdj.expiresAt);
  });

  it("W-8: no reference may name a patient ledger object", async () => {
    for (const ref of ["patient:abc", "reward:r1", "pcl_1"]) {
      await assert.rejects(() => wallet.grantInTransaction({ tenantId: a, amount: D(1), reason: CreditReason.GOODWILL, sourceRef: ref }), /patient ledger/);
      await assert.rejects(() => wallet.consume(a, 1, CreditReason.KIOREX_FEE_OFFSET, { sourceRef: ref }), /patient ledger/);
    }
  });

  it("W-7: balance equals Sigma ledger and Sigma remaining of the lots for both wallets", async () => {
    for (const t of [a, b]) {
      const w = await prisma.creditWallet.findUniqueOrThrow({ where: { tenantId: t } });
      const ledger = await prisma.creditLedgerEntry.aggregate({ where: { walletId: w.id }, _sum: { amount: true } });
      const lots = await prisma.creditLedgerEntry.aggregate({ where: { walletId: w.id, type: "GRANT" }, _sum: { remaining: true } });
      assert.equal(ledger._sum.amount?.toFixed(2), w.balance.toFixed(2));
      assert.equal(lots._sum.remaining?.toFixed(2), w.balance.toFixed(2));
    }
  });

  it("W-2: another organisation's wallet is unreachable (read matrix) and providers cannot grant", async () => {
    await assert.rejects(() => wallet.getWalletForTenant(user(b, UserRole.CLINIC_ADMIN, true), a), /Forbidden/);
    await assert.rejects(() => wallet.grantManual(user(a, UserRole.CLINIC_ADMIN, true), a, { amount: 1, reason: CreditReason.GOODWILL, note: "n" }), /Only platform super administrators/);
    // the controller reads the signed-in user's own tenant only: there is no tenant id parameter to forge
    const mine = await controller.getWallet(user(b, UserRole.CLINIC_ADMIN, true));
    assert.equal(mine.balance, "7.00");
    const other = await controller.getWallet(user(a, UserRole.FINANCE_OFFICER));
    assert.notEqual(other.balance, "7.00");
  });

  it("read roles: owner and finance can read, reception and physicians cannot", async () => {
    assert.ok(await controller.getWallet(user(a, UserRole.RECEPTIONIST, true)));
    assert.ok(await controller.getWallet(user(a, UserRole.FINANCE_OFFICER)));
    for (const role of [UserRole.RECEPTIONIST, UserRole.PHYSICIAN, UserRole.NURSE, UserRole.CALL_CENTER]) assert.throws(() => controller.getWallet(user(a, role)), /Only the owner and finance/);
  });

  it("manual grants refuse spend-side reasons", async () => {
    await assert.rejects(() => wallet.grantManual({ userId: "x", tenantId: null, email: "e", role: UserRole.PLATFORM_SUPER_ADMIN }, a, { amount: 1, reason: CreditReason.SPONSORED_PROMOTION, note: "n" }), /cannot be granted by hand/);
  });

  it("the unit ledger is append-only too", async () => {
    const row = await prisma.usageUnitLedger.create({ data: { tenantId: a, unit: "SMS", delta: 5, reason: "T", idempotencyKey: `u:${suffix}` } });
    await assert.rejects(() => prisma.usageUnitLedger.update({ where: { id: row.id }, data: { delta: 6 } }), /append-only/);
    await assert.rejects(() => prisma.usageUnitLedger.delete({ where: { id: row.id } }), /append-only/);
  });
});
