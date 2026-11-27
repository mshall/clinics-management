import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hashIntegrationSecret } from "../integrations/integration-token";
import { MarketplaceClientBootstrapService, platformClientScopes, readMarketplaceClientBootstrap } from "./marketplace-client-bootstrap.service";

type Row = { id: string; clientKey: string; secretHash: string; deactivatedAt: Date | null; scopes?: string[] };
function fake(rows: Row[]) {
  const calls: string[] = [];
  const prisma = {
    platformIntegrationClient: {
      findFirst: async ({ where }: { where: { clientKey: string } }) => rows.find((r) => r.clientKey === where.clientKey) ?? null,
      create: async ({ data }: { data: { clientKey: string; secretHash: string; scopes: string[] } }) => { calls.push(`create:${data.scopes.join(",")}`); rows.push({ id: "n", clientKey: data.clientKey, secretHash: data.secretHash, deactivatedAt: null, scopes: data.scopes }); },
      update: async ({ data }: { where: { id: string }; data: { secretHash?: string; scopes?: string[] } }) => { calls.push(data.secretHash ? "update" : `scopes:${data.scopes?.join(",")}`); if (data.secretHash) rows[0]!.secretHash = data.secretHash; if (data.scopes) rows[0]!.scopes = data.scopes; },
    },
  };
  return { svc: new MarketplaceClientBootstrapService(prisma as never), calls, rows };
}
const cfg = { clientKey: "kx_testkey_1234", secret: "s".repeat(32) };

describe("marketplace client bootstrap (configuration-driven registration)", () => {
  it("is off unless both values are set and look like credentials", () => {
    assert.equal(readMarketplaceClientBootstrap({}), null);
    assert.equal(readMarketplaceClientBootstrap({ KIOREX_MARKETPLACE_CLIENT_KEY: "kx_testkey_1234" }), null);
    assert.equal(readMarketplaceClientBootstrap({ KIOREX_MARKETPLACE_CLIENT_KEY: "kx_testkey_1234", KIOREX_MARKETPLACE_CLIENT_SECRET: "short" }), null);
    assert.deepEqual(readMarketplaceClientBootstrap({ KIOREX_MARKETPLACE_CLIENT_KEY: " kx_testkey_1234 ", KIOREX_MARKETPLACE_CLIENT_SECRET: "s".repeat(32) }), cfg);
  });
  it("does nothing when off", async () => { const f = fake([]); assert.equal(await f.svc.ensure(null), "off"); assert.deepEqual(f.calls, []); });
  it("creates a MARKETPLACE + MARKET_ADMIN client (Kiorly admin market launch), then leaves it unchanged on the next boot", async () => {
    const f = fake([]);
    assert.equal(await f.svc.ensure(cfg), "created");
    assert.deepEqual(f.calls, ["create:MARKETPLACE,MARKET_ADMIN"]);
    assert.equal(await f.svc.ensure(cfg), "unchanged");
    assert.deepEqual(f.calls, ["create:MARKETPLACE,MARKET_ADMIN"]);
  });
  it("rotates the stored hash when the configured secret changed, and leaves a deactivated client alone", async () => {
    const f = fake([{ id: "1", clientKey: cfg.clientKey, secretHash: await hashIntegrationSecret("old".repeat(12)), deactivatedAt: null, scopes: ["MARKETPLACE", "MARKET_ADMIN"] }]);
    assert.equal(await f.svc.ensure(cfg), "rotated");
    assert.deepEqual(f.calls, ["update"]);
    const g = fake([{ id: "1", clientKey: cfg.clientKey, secretHash: "x", deactivatedAt: new Date(), scopes: ["MARKETPLACE"] }]);
    assert.equal(await g.svc.ensure(cfg), "deactivated-left-alone");
    assert.deepEqual(g.calls, []);
  });
  it("an existing platform client gains MARKET_ADMIN on the next boot; KIOREX_MARKET_ADMIN=off keeps it MARKETPLACE only", async () => {
    const f = fake([{ id: "1", clientKey: cfg.clientKey, secretHash: await hashIntegrationSecret(cfg.secret), deactivatedAt: null, scopes: ["MARKETPLACE"] }]);
    assert.equal(await f.svc.ensure(cfg), "scopes-updated");
    assert.deepEqual(f.calls, ["scopes:MARKETPLACE,MARKET_ADMIN"]);
    assert.equal(await f.svc.ensure(cfg), "unchanged");
    process.env.KIOREX_MARKET_ADMIN = "off";
    try {
      assert.deepEqual(platformClientScopes(), ["MARKETPLACE"]);
      assert.equal(await f.svc.ensure(cfg), "scopes-updated");
      assert.deepEqual(f.rows[0]!.scopes, ["MARKETPLACE"]);
    } finally {
      delete process.env.KIOREX_MARKET_ADMIN;
    }
  });
  it("never throws at boot", async () => {
    const svc = new MarketplaceClientBootstrapService({ platformIntegrationClient: { findFirst: async () => { throw new Error("db down"); } } } as never);
    process.env.KIOREX_MARKETPLACE_CLIENT_KEY = cfg.clientKey; process.env.KIOREX_MARKETPLACE_CLIENT_SECRET = cfg.secret;
    try { await svc.onApplicationBootstrap(); } finally { delete process.env.KIOREX_MARKETPLACE_CLIENT_KEY; delete process.env.KIOREX_MARKETPLACE_CLIENT_SECRET; }
  });
});
