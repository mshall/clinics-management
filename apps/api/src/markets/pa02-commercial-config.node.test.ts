import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dunningTimelineFromFeatureDefaults } from "../subscriptions/dunning-config";
import { resolveTrialConfig } from "../subscriptions/trial-config";
import {
  commercialConfigFromFeatureDefaults,
  commercialConfigToFeatureDefaultsPatch,
  mergeFeatureDefaults,
} from "./commercial-config.bridge";
import { DEFAULT_COMMERCIAL_CONFIG, safeParseCommercialConfig } from "./commercial-config.schema";

describe("PA-02 commercial config schema", () => {
  it("rejects dunning timeline when readOnly is before grace end", () => {
    const bad = safeParseCommercialConfig({
      ...DEFAULT_COMMERCIAL_CONFIG,
      dunning: { graceDays: 20, readOnlyAfterDays: 15, suspendAfterDays: 45 },
    });
    assert.equal(bad.success, false);
  });

  it("rejects negative lite min invoice", () => {
    const bad = safeParseCommercialConfig({
      ...DEFAULT_COMMERCIAL_CONFIG,
      lite: { commissionMonthlyCap: null, minInvoice: -1 },
    });
    assert.equal(bad.success, false);
  });
});

describe("PA-02 commercial config bridge", () => {
  it("maps saved config into featureDefaults consumed by dunning + trial without restart", () => {
    const config = {
      ...DEFAULT_COMMERCIAL_CONFIG,
      dunning: { graceDays: 10, readOnlyAfterDays: 20, suspendAfterDays: 60 },
      trial: {
        ...DEFAULT_COMMERCIAL_CONFIG.trial,
        standardDays: 60,
        foundingDays: 120,
        activation: { minVisits: 15, withinDays: 45 },
      },
    };
    const patch = commercialConfigToFeatureDefaultsPatch(config);
    const merged = mergeFeatureDefaults({}, patch);
    const dunning = dunningTimelineFromFeatureDefaults(merged);
    assert.equal(dunning.graceEndDay, 10);
    assert.equal(dunning.readOnlyFromDay, 20);
    assert.equal(dunning.suspendedFromDay, 60);

    const trial = resolveTrialConfig({ marketFeatureDefaults: merged });
    assert.equal(trial.standardDays, 60);
    assert.equal(trial.minQualifyingVisits, 15);
    assert.equal(trial.activationWindowDays, 45);
  });

  it("imports legacy featureDefaults into commercial config shape", () => {
    const imported = commercialConfigFromFeatureDefaults({
      trial: { standardDays: 45, foundingDays: 90, minQualifyingVisits: 5, activationWindowDays: 14 },
      kiorlyBilling: { liteMinInvoice: 75, dunning: { graceEndDay: 12, readOnlyFromDay: 18, suspendedFromDay: 40 } },
    });
    assert.equal(imported.trial.standardDays, 45);
    assert.equal(imported.lite.minInvoice, 75);
    assert.equal(imported.dunning.graceDays, 12);
  });
});