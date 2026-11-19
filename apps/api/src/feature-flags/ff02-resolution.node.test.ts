import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveFlag, type FlagResolutionInput } from "./feature-flag-resolution";
import { FeatureFlagsService } from "./feature-flags.service";
import type { FlagSnapshot, SnapshotFlag } from "./kiorex-flag-snapshot";
import { KiorexFlagSnapshotService } from "./kiorex-flag-snapshot.service";

const base: FlagResolutionInput = {
  globalValue: null,
  marketValue: null,
  orgValue: null,
  planEntitled: true,
  launchLocked: false,
  gateSatisfied: false,
  parents: [],
};

describe("FF02 resolution — the 7 rules", () => {
  it("1 default ON at every scope", () => assert.deepEqual(resolveFlag(base), { effective: true, source: "default" }));
  it("2 global OFF wins over everything", () => {
    const r = resolveFlag({ ...base, globalValue: "OFF", orgValue: "ON", marketValue: "ON" });
    assert.equal(r.effective, false);
    assert.equal(r.scope, "global");
  });
  it("3 market OFF cannot be re-enabled by org ON", () => {
    const r = resolveFlag({ ...base, marketValue: "OFF", orgValue: "ON" });
    assert.deepEqual([r.effective, r.scope], [false, "market"]);
  });
  it("4 org OFF only affects that org", () => {
    const r = resolveFlag({ ...base, orgValue: "OFF" });
    assert.deepEqual([r.effective, r.scope], [false, "org"]);
  });
  it("5 plan not entitled ⇒ OFF (source plan)", () => assert.equal(resolveFlag({ ...base, planEntitled: false }).source, "plan"));
  it("6 launch-locked is OFF until gate evidence", () => {
    assert.equal(resolveFlag({ ...base, launchLocked: true }).source, "gate");
    assert.equal(resolveFlag({ ...base, launchLocked: true, gateSatisfied: true }).effective, true);
  });
  it("7 dependency OFF blocks the child", () => {
    const r = resolveFlag({ ...base, parents: [{ key: "p", effective: false, scope: "market" }] });
    assert.deepEqual([r.effective, r.source, r.blockedParent, r.scope], [false, "dependency", "p", "market"]);
  });
});

function flag(key: string, over: Partial<SnapshotFlag> = {}): SnapshotFlag {
  return {
    key,
    class: "Module",
    scopes: ["global", "market", "org"],
    dependsOn: [],
    launchLocked: false,
    gateSatisfied: false,
    values: {},
    ...over,
  };
}
const snap = (flags: SnapshotFlag[], version = 1): FlagSnapshot => ({
  product: "kiorly-clinic",
  version,
  generatedAt: new Date().toISOString(),
  flags,
  signature: "x",
});

function service(withSnapshot: FlagSnapshot | null | "none") {
  const prisma = {
    tenant: {
      findUnique: async () => ({
        id: "t1",
        whatsAppRemindersEnabled: true,
        market: { code: "EG", featureFlags: [], featureDefaults: {} },
        tenantFeatureFlags: [],
      }),
    },
    featureFlag: { findMany: async () => [] },
  };
  const ents = { resolve: async () => ({ entitlements: {} }) };
  const snaps = new KiorexFlagSnapshotService(prisma as never, {} as never);
  if (withSnapshot && withSnapshot !== "none") snaps.setSnapshotForTests(withSnapshot);
  return new FeatureFlagsService(prisma as never, ents as never, snaps);
}

describe("FF02 FeatureFlagsService with snapshot", () => {
  it("no snapshot: ON by default, launch-locked OFF (code defaults)", async () => {
    const s = service("none");
    assert.equal(await s.isEnabled("t1", "clinic.ai_scribe"), true);
    assert.equal(await s.isEnabled("t1", "clinic.whatsapp_ai_receptionist"), false);
    assert.equal(s.isManaged(), false);
  });

  it("global/market/org OFF values map to scopes (case-insensitive market)", async () => {
    const s = service(
      snap([
        flag("clinic.ai_scribe", { values: { markets: { eg: "OFF" } } }),
        flag("clinic.payers_tpa", { values: { orgs: { t1: "OFF" } } }),
        flag("clinic.no_show_risk", { values: { global: "OFF" } }),
        flag("clinic.referral_rewards", { values: { orgs: { other: "OFF" } } }),
      ]),
    );
    assert.deepEqual((await s.evaluate("t1", "clinic.ai_scribe")).scope, "market");
    assert.deepEqual((await s.evaluate("t1", "clinic.payers_tpa")).scope, "org");
    assert.deepEqual((await s.evaluate("t1", "clinic.no_show_risk")).scope, "global");
    assert.equal(await s.isEnabled("t1", "clinic.referral_rewards"), true);
  });

  it("gate evidence enables launch-locked; dependencies cascade", async () => {
    const s = service(
      snap([
        flag("clinic.whatsapp_ai_receptionist", { launchLocked: true, gateSatisfied: true }),
        flag("clinic.whatsapp_inbound", { values: { global: "OFF" } }),
      ]),
    );
    const r = await s.evaluate("t1", "clinic.whatsapp_ai_receptionist");
    assert.equal(r.effective, false);
    assert.equal(r.source, "dependency");
    assert.equal(r.blockedParent, "clinic.whatsapp_inbound");
  });

  it("expired OFF reverts to ON", async () => {
    const s = service(snap([flag("clinic.ai_scribe", { values: { global: "OFF" }, expiresAt: new Date(Date.now() - 1000).toISOString() })]));
    assert.equal(await s.isEnabled("t1", "clinic.ai_scribe"), true);
  });

  it("platform pages are read-only once managed", async () => {
    const s = service(snap([]));
    assert.throws(() => s.assertNotManaged(), (e: { response?: { code?: string } }) => e.response?.code === "FLAG_MANAGED_BY_KIOREX");
  });

  it("unknown key is never effective", async () => {
    assert.equal(await service("none").isEnabled("t1", "clinic.nope"), false);
  });
});
