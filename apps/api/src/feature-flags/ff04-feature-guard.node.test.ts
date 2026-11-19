import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Reflector } from "@nestjs/core";
import { CLINIC_FLAG_DEFINITIONS } from "./feature-flag-keys";
import { FeatureDisabledException } from "./feature-disabled.exception";
import { FeatureFlagsService } from "./feature-flags.service";
import { FeatureGuard } from "./feature.guard";
import { RequiresFeature, REQUIRES_FEATURE_KEY } from "./requires-feature.decorator";
import type { FlagSnapshot, SnapshotFlag } from "./kiorex-flag-snapshot";
import { KiorexFlagSnapshotService } from "./kiorex-flag-snapshot.service";

function flagsWith(flags: SnapshotFlag[]) {
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
  const snaps = new KiorexFlagSnapshotService(prisma as never, {} as never);
  snaps.setSnapshotForTests({ product: "kiorly-clinic", version: 1, generatedAt: new Date().toISOString(), flags, signature: "x" } as FlagSnapshot);
  return new FeatureFlagsService(prisma as never, { resolve: async () => ({ entitlements: {} }) } as never, snaps);
}

function ctx(key: string | undefined, user: { tenantId: string | null } | undefined) {
  class C {
    h() {}
  }
  if (key) RequiresFeature(key)(C.prototype, "h", Object.getOwnPropertyDescriptor(C.prototype, "h")!);
  return {
    getHandler: () => C.prototype.h,
    getClass: () => C,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  };
}

const concrete = CLINIC_FLAG_DEFINITIONS.map((d) => (d.keyPattern ? "clinic.specialty_templates.dermatology" : d.key));

describe("FF04 per-flag OFF contract: 403 FEATURE_DISABLED {key, scope}", () => {
  for (const key of concrete) {
    for (const scope of ["global", "market", "org"] as const) {
      const def = CLINIC_FLAG_DEFINITIONS.find((d) => d.key === key || (d.keyPattern && key.startsWith("clinic.specialty_templates.")))!;
      if (!def.scopes.includes(scope)) continue;
      it(`${key} OFF at ${scope}`, async () => {
        const values = scope === "global" ? { global: "OFF" } : scope === "market" ? { markets: { EG: "OFF" } } : { orgs: { t1: "OFF" } };
        const flags = flagsWith([
          { key, class: "Module", scopes: ["global", "market", "org"], dependsOn: [], launchLocked: false, gateSatisfied: true, values } as SnapshotFlag,
        ]);
        const guard = new FeatureGuard(new Reflector(), flags);
        await assert.rejects(
          guard.canActivate(ctx(key, { tenantId: "t1" }) as never),
          (e: FeatureDisabledException) => {
            assert.equal(e.getStatus(), 403);
            const body = e.getResponse() as { code: string; key: string; scope: string };
            assert.deepEqual([body.code, body.key, body.scope], ["FEATURE_DISABLED", key, scope]);
            return true;
          },
        );
      });
    }
  }

  it("ON (inherit) passes; no decorator passes; reads are unaffected by design", async () => {
    const guard = new FeatureGuard(new Reflector(), flagsWith([]));
    assert.equal(await guard.canActivate(ctx("clinic.ai_scribe", { tenantId: "t1" }) as never), true);
    assert.equal(await guard.canActivate(ctx(undefined, { tenantId: "t1" }) as never), true);
    assert.equal(typeof REQUIRES_FEATURE_KEY, "string");
  });

  it("launch-locked key without gate evidence is blocked with scope global", async () => {
    const guard = new FeatureGuard(new Reflector(), flagsWith([]));
    await assert.rejects(
      guard.canActivate(ctx("clinic.whatsapp_ai_receptionist", { tenantId: "t1" }) as never),
      (e: FeatureDisabledException) => e.scope === "global",
    );
  });
});
