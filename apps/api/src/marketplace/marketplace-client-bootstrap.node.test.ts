import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hashIntegrationSecret } from "../integrations/integration-token";
import { MarketplaceClientBootstrapService, readMarketplaceClientBootstrap } from "./marketplace-client-bootstrap.service";

type Row = { id: string; clientKey: string; secretHash: string; deactivatedAt: Date | null };
function fake(rows: Row[]) {
  const calls: string[] = [];
  const prisma = {
    platformIntegrationClient: {
      findFirst: async ({ where }: { where: { clientKey: string } }) => rows.find((r) => r.clientKey === where.clientKey) ?? null,
      create: async ({ data }: { data: { clientKey: string; secretHash: string; scopes: string[] } }) => { calls.push(`create:${data.scopes.join(",")}`); rows.push({ id: "n", clientKey: data.clientKey, secretHash: data.secretHash, deactivatedAt: null }); },
      update: async ({ data }: { where: { id: string }; data: { secretHash: string } }) => { calls.push("update"); rows[0]!.secretHash = data.secretHash; },
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
  it("creates a MARKETPLACE-scope client, then leaves it unchanged on the next boot", async () => {
    const f = fake([]);
    assert.equal(await f.svc.ensure(cfg), "created");
    assert.deepEqual(f.calls, ["create:MARKETPLACE"]);
    assert.equal(await f.svc.ensure(cfg), "unchanged");
    assert.deepEqual(f.calls, ["create:MARKETPLACE"]);
  });
  it("rotates the stored hash when the configured secret changed, and leaves a deactivated client alone", async () => {
    const f = fake([{ id: "1", clientKey: cfg.clientKey, secretHash: await hashIntegrationSecret("old".repeat(12)), deactivatedAt: null }]);
    assert.equal(await f.svc.ensure(cfg), "rotated");
    assert.deepEqual(f.calls, ["update"]);
    const g = fake([{ id: "1", clientKey: cfg.clientKey, secretHash: "x", deactivatedAt: new Date() }]);
    assert.equal(await g.svc.ensure(cfg), "deactivated-left-alone");
    assert.deepEqual(g.calls, []);
  });
  it("never throws at boot", async () => {
    const svc = new MarketplaceClientBootstrapService({ platformIntegrationClient: { findFirst: async () => { throw new Error("db down"); } } } as never);
    process.env.KIOREX_MARKETPLACE_CLIENT_KEY = cfg.clientKey; process.env.KIOREX_MARKETPLACE_CLIENT_SECRET = cfg.secret;
    try { await svc.onApplicationBootstrap(); } finally { delete process.env.KIOREX_MARKETPLACE_CLIENT_KEY; delete process.env.KIOREX_MARKETPLACE_CLIENT_SECRET; }
  });
});
