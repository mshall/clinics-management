import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { MarketLaunchStatus, PlanKey } from "@prisma/client";
import { ensurePlanCatalog } from "../../prisma/plan-catalog-seed";
import { OutboxEventService } from "../messaging/outbox-event.service";
import { createPrismaClient } from "../prisma/create-prisma-client";
import type { PrismaService } from "../prisma/prisma.service";
import { PlansService } from "../plans/plans.service";
import { PriceIndexationService } from "../plans/price-indexation.service";
import { KiorlyAdminPlansController } from "./kiorly-admin-plans.controller";

const prisma = createPrismaClient();
const ps = prisma as unknown as PrismaService;
const plans = new PlansService(ps, new PriceIndexationService(ps, new OutboxEventService(ps)));
const ctl = new KiorlyAdminPlansController(plans, ps);
const admin = { id: "c1", clientKey: "k", name: "n", scopes: ["MARKET_ADMIN"], ipAllowlist: [] };
const noScope = { ...admin, scopes: ["BOOKINGS"] };
const actor = { id: "super_1", email: "founder@example.com" };
const code = (e: unknown) => (e as { response?: { code?: string } }).response?.code;
const status = (e: unknown) => (e as { status?: number; getStatus?: () => number }).getStatus?.();

let marketId = ""; let tenantId = ""; let planId = ""; let originalName = "";

describe("Kiorly admin: Clinic plans over the signed marketplace route", () => {
  before(async () => {
    await prisma.$connect();
    await ensurePlanCatalog(prisma);
    await prisma.tenant.deleteMany({ where: { market: { code: "QP" } } });
    await prisma.market.deleteMany({ where: { code: "QP" } });
    const m = await prisma.market.create({ data: { code: "QP", nameEn: "Plans test", hostCell: "frankfurt", defaultCurrency: "USD", defaultTimezone: "UTC", defaultLocale: "en-US", defaultPhoneRegion: "US", weekendDays: [6, 0], enabledLanguages: ["en"], status: MarketLaunchStatus.LIVE } });
    marketId = m.id;
    tenantId = (await prisma.tenant.create({ data: { name: `QP org ${Date.now()}`, marketId, deploymentCell: "frankfurt", baseCurrency: "USD" } })).id;
    const p = await prisma.plan.findUniqueOrThrow({ where: { key: PlanKey.PRO } });
    planId = p.id; originalName = p.nameEn;
  });
  after(async () => {
    await prisma.plan.update({ where: { id: planId }, data: { nameEn: originalName } });
    await prisma.auditLog.deleteMany({ where: { tenantId } });
    await prisma.planPrice.deleteMany({ where: { marketId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.market.deleteMany({ where: { id: marketId } });
    await prisma.$disconnect();
  });

  it("needs the MARKET_ADMIN scope for every route", async () => {
    await assert.rejects(async () => ctl.list(noScope as never), (e) => code(e) === "MARKET_ADMIN_SCOPE_REQUIRED");
    await assert.rejects(async () => ctl.patch(noScope as never, planId, { actor, nameEn: "x" } as never), (e) => code(e) === "MARKET_ADMIN_SCOPE_REQUIRED");
    await assert.rejects(async () => ctl.price(noScope as never, planId, { actor } as never), (e) => code(e) === "MARKET_ADMIN_SCOPE_REQUIRED");
  });

  it("lists every plan (also the non-public ones) with the markets and their currency", async () => {
    const r = await ctl.list(admin as never);
    assert.ok(r.plans.length >= 7);
    assert.ok(r.plans.some((p) => !p.isPublic));
    assert.ok(r.markets.some((m) => m.code === "QP" && m.defaultCurrency === "USD"));
  });

  it("changing a plan needs a valid actor, then changes only the whitelisted fields", async () => {
    await assert.rejects(async () => ctl.patch(admin as never, planId, { nameEn: "NoActor" } as never), (e) => code(e) === "ACTOR_REQUIRED");
    await assert.rejects(async () => ctl.patch(admin as never, planId, { actor: { id: "bad id with spaces" }, nameEn: "x" } as never), (e) => code(e) === "ACTOR_REQUIRED");
    const r = await ctl.patch(admin as never, planId, { actor, nameEn: "Pro (tagged)", key: "ENTERPRISE" } as never);
    assert.equal(r.nameEn, "Pro (tagged)");
    assert.equal(r.key, PlanKey.PRO, "the key can never change");
    await assert.rejects(async () => ctl.patch(admin as never, "no_such_plan", { actor, nameEn: "x" } as never), (e) => status(e) === 404);
  });

  it("price: preview publishes nothing; publish creates an effective-dated version and writes the audit row with the Kiorly admin actor", async () => {
    const body = { actor, marketId, currency: "USD", interval: "MONTHLY", unit: "PER_TENANT", amount: "12.50" } as never;
    const before = await prisma.planPrice.count({ where: { marketId } });
    const pv = (await ctl.price(admin as never, planId, { ...(body as object), preview: true } as never)) as { preview?: boolean };
    assert.equal(pv.preview, true);
    assert.equal(await prisma.planPrice.count({ where: { marketId } }), before, "preview creates nothing");
    const future = new Date(Date.now() + 7 * 86_400_000).toISOString();
    const created = (await ctl.price(admin as never, planId, { ...(body as object), validFrom: future } as never)) as { id: string; amount: string; validFrom: string };
    assert.equal(created.amount, "12.5");
    assert.equal(created.validFrom, future);
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { tenantId, action: "plan.price.published" } });
    assert.equal(audit.actorId, null, "no Clinic user: the AuditLog actor is a foreign key");
    assert.equal((audit.metadata as { actorRef: string }).actorRef, "kiorly-admin:super_1");
    assert.equal((audit.metadata as { actorSource: string }).actorSource, "KIORLY_ADMIN");
    assert.equal((audit.metadata as { amount: string }).amount, "12.50");
    // a second version supersedes the first one at its validFrom (versioned, never overwritten)
    const v2 = (await ctl.price(admin as never, planId, { ...(body as object), amount: "13", validFrom: new Date(Date.now() + 14 * 86_400_000).toISOString() } as never)) as { priceVersion: number };
    assert.equal(v2.priceVersion, 2);
    assert.equal(await prisma.planPrice.count({ where: { marketId } }), 2);
  });

  it("price: bad amounts, currencies and markets are refused, never stored", async () => {
    const ok = { actor, marketId, currency: "USD", interval: "MONTHLY", unit: "PER_TENANT" };
    const n = await prisma.planPrice.count({ where: { marketId } });
    for (const amount of ["abc", "-5", "1e3", "1.234", "", "1,5"]) await assert.rejects(async () => ctl.price(admin as never, planId, { ...ok, amount } as never), (e) => status(e) === 400, `amount ${amount}`);
    await assert.rejects(async () => ctl.price(admin as never, planId, { ...ok, amount: "5", currency: "DOLLARS" } as never), (e) => status(e) === 400);
    await assert.rejects(async () => ctl.price(admin as never, planId, { ...ok, amount: "5", marketId: "nope" } as never), (e) => status(e) === 400);
    await assert.rejects(async () => ctl.price(admin as never, planId, { ...ok, amount: "5", extraClinicianAmount: "x" } as never), (e) => status(e) === 400);
    assert.equal(await prisma.planPrice.count({ where: { marketId } }), n);
  });
});
