import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { MarketLaunchStatus } from "@prisma/client";
import { createPrismaClient } from "../prisma/create-prisma-client";
import type { PrismaService } from "../prisma/prisma.service";
import type { FeatureFlagsService } from "../feature-flags/feature-flags.service";
import type { EntitlementsService } from "../entitlements/entitlements.service";
import { ClinicsService } from "../clinics/clinics.service";
import { MarketplaceAccessService } from "../marketplace/marketplace-access.service";
import { KiorlyAdminMarketsController } from "../marketplace/kiorly-admin-markets.controller";
import { MarketsService } from "./markets.service";
import { MarketProvisionService } from "./market-provision.service";
import { LegalConfigService } from "./legal-config.service";
import { CommercialConfigService } from "./commercial-config.service";

const prisma = createPrismaClient();
const ps = prisma as unknown as PrismaService;
const clinics = new ClinicsService(ps, {} as EntitlementsService);
const access = new MarketplaceAccessService(ps);
const markets = new MarketsService(ps, {} as FeatureFlagsService, new MarketProvisionService());
const signed = new KiorlyAdminMarketsController(markets, new LegalConfigService(ps), new CommercialConfigService(ps));

const code = (e: unknown) => (e as { response?: { code?: string } }).response?.code;
const principal = (scopes: string[]) => ({ id: "c1", clientKey: "k", name: "n", scopes, ipAllowlist: [] });
const createdMarkets: string[] = [];
const createdTenants: string[] = [];

async function orgIn(marketCode: string) {
  await prisma.tenant.deleteMany({ where: { market: { code: marketCode } } });
  await prisma.market.deleteMany({ where: { code: marketCode } });
  const market = await prisma.market.create({
    data: { code: marketCode, nameEn: marketCode, hostCell: "frankfurt", defaultCurrency: "USD", defaultTimezone: "UTC", defaultLocale: "en-US", defaultPhoneRegion: "US", weekendDays: [6, 0], enabledLanguages: ["en"], status: MarketLaunchStatus.LIVE, taxConfig: { invoiceVatPercent: 14, saasVatPercent: 14, defaultVisitFee: 100 } },
  });
  createdMarkets.push(market.id);
  const tenant = await prisma.tenant.create({ data: { name: `Fixed ${marketCode} ${Date.now()}`, marketId: market.id, deploymentCell: "frankfurt", baseCurrency: "USD" } });
  createdTenants.push(tenant.id);
  return { market, tenant };
}

before(async () => { await prisma.$connect(); });
after(async () => {
  await prisma.clinic.deleteMany({ where: { tenantId: { in: createdTenants } } });
  await prisma.tenant.deleteMany({ where: { id: { in: createdTenants } } });
  await prisma.market.deleteMany({ where: { id: { in: createdMarkets } } });
  await prisma.$disconnect();
});

describe("an organisation belongs to its country for life (decision A, Clinic)", () => {
  const base = { nameEn: "Branch", nameAr: "فرع", city: "Town" } as never;

  it("a new clinic is created in the organisation's country even when the request says nothing", async () => {
    const { tenant } = await orgIn("WA");
    const c = await clinics.create(tenant.id, { ...(base as object) } as never);
    assert.equal(c.country, "WA");
  });

  it("a clinic in another country is refused (409 ORG_MARKET_MISMATCH); the same country in any case is fine", async () => {
    const { tenant } = await orgIn("WB");
    await assert.rejects(clinics.create(tenant.id, { ...(base as object), country: "AE" } as never), (e) => code(e) === "ORG_MARKET_MISMATCH");
    const ok = await clinics.create(tenant.id, { ...(base as object), country: "wb" } as never);
    assert.equal(ok.country, "WB");
  });

  it("the country of an existing clinic cannot be changed (same value accepted, anything else refused)", async () => {
    const { tenant } = await orgIn("WC");
    const c = await clinics.create(tenant.id, base);
    await assert.rejects(clinics.update(tenant.id, c.id, { country: "EG" } as never), (e) => code(e) === "ORG_COUNTRY_IMMUTABLE");
    await assert.rejects(clinics.update(tenant.id, c.id, { country: "" } as never), (e) => code(e) === "ORG_COUNTRY_IMMUTABLE");
    await clinics.update(tenant.id, c.id, { country: " wc ", city: "Elsewhere" } as never);
    const row = await prisma.clinic.findUniqueOrThrow({ where: { id: c.id } });
    assert.equal(row.country, "WC");
    assert.equal(row.city, "Elsewhere");
  });

  it("a Kiorex booking may only name the provider's own market", async () => {
    const { tenant } = await orgIn("WD");
    await assert.rejects(access.assertSameMarket(tenant.id, "EG"), (e) => code(e) === "CROSS_MARKET_BOOKING");
    await assert.rejects(access.assertSameMarket(tenant.id, "we"), (e) => code(e) === "CROSS_MARKET_BOOKING");
    await assert.rejects(access.assertSameMarket(tenant.id, "not-a-market"), (e) => code(e) === "CROSS_MARKET_BOOKING");
    await assert.rejects(access.assertSameMarket(tenant.id, 42), (e) => code(e) === "CROSS_MARKET_BOOKING");
    await access.assertSameMarket(tenant.id, "WD");
    await access.assertSameMarket(tenant.id, "wd");
    // older Kiorex that does not send the market keeps working
    await access.assertSameMarket(tenant.id, undefined);
    await access.assertSameMarket(tenant.id, null);
    await access.assertSameMarket(tenant.id, "");
  });
});

describe("Kiorly admin signed route (ADR-060)", () => {
  it("needs the MARKET_ADMIN scope: a plain MARKETPLACE client is refused on every route", async () => {
    const plain = principal(["MARKETPLACE"]);
    const actor = { actor: { id: "ops-1" }, reason: "try it" };
    for (const call of [
      () => signed.list(plain),
      () => signed.defaults(plain),
      () => signed.one(plain, "x"),
      () => signed.audit(plain, "x"),
      () => signed.requests(plain, "x"),
      () => signed.create(plain, actor),
      () => signed.launch(plain, "x", actor),
      () => signed.pause(plain, "x", actor),
      () => signed.disable(plain, "x", actor),
      () => signed.enable(plain, "x", actor),
      () => signed.putLegal(plain, "x", actor),
      () => signed.putTax(plain, "x", actor),
      () => signed.second(plain, "x", actor),
      () => signed.approve(plain, "x", "r", actor),
      () => signed.reject(plain, "x", "r", actor),
    ]) {
      await assert.rejects(async () => call(), (e) => code(e) === "MARKET_ADMIN_SCOPE_REQUIRED");
    }
  });

  it("with the scope: reads work, a change without an actor is refused, with an actor it is recorded as KIORLY_ADMIN", async () => {
    const admin = principal(["MARKETPLACE", "MARKET_ADMIN"]);
    const list = (await signed.list(admin)) as Array<{ code: string }>;
    assert.ok(Array.isArray(list));
    assert.ok((await signed.defaults(admin)).length >= 10);
    await assert.rejects(async () => signed.create(admin, { code: "WF", reason: "no actor" }), (e) => code(e) === "ACTOR_REQUIRED");
    await assert.rejects(async () => signed.create(admin, { actor: { id: "bad id!" }, code: "WF" }), (e) => code(e) === "ACTOR_REQUIRED");
    const created = (await signed.create(admin, { actor: { id: "ops-9", email: "ops@example.com" }, code: "WF", nameEn: "Qf", defaultCurrency: "USD", defaultTimezone: "UTC", defaultLocale: "en-US", defaultPhoneRegion: "US", weekendDays: [0], enabledLanguages: ["en"] })) as { id: string };
    createdMarkets.push(created.id);
    const trail = (await signed.audit(admin, created.id)) as { items: Array<{ actorId: string; actorSource: string; actorEmail: string }> };
    assert.equal(trail.items[0]!.actorId, "kiorly-admin:ops-9");
    assert.equal(trail.items[0]!.actorSource, "KIORLY_ADMIN");
    assert.equal(trail.items[0]!.actorEmail, "ops@example.com");
    const one = (await signed.one(admin, created.id)) as { market: { readiness: { canLaunch: boolean; blockers: Array<{ code: string }> } } };
    assert.equal(one.market.readiness.canLaunch, false);
    assert.ok(one.market.readiness.blockers.some((b) => b.code === "TAX_PACK_MISSING"));
    await assert.rejects(async () => signed.launch(admin, created.id, { actor: { id: "ops-9" }, reason: "launch now" }), (e) => code(e) === "TAX_PACK_MISSING");
  });
});
