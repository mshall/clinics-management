import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_TRIAL_PACK,
  foundingTrialEndsAt,
  resolveTrialConfig,
  standardTrialEndsAt,
} from "./trial-config";
import { trialActivationProgress } from "./trial-activation";

describe("CR-01 trial config", () => {
  it("founding trial = 180 days and standard = 90 when activated vs not (from config)", () => {
    const config = resolveTrialConfig({
      marketFeatureDefaults: {
        trial: { foundingDays: 180, standardDays: 90 },
      },
    });
    const start = new Date("2026-01-01T00:00:00.000Z");
    const foundingEnd = foundingTrialEndsAt(start, config);
    const standardEnd = standardTrialEndsAt(start, config);
    assert.equal(
      Math.round((foundingEnd.getTime() - start.getTime()) / 86_400_000),
      180,
    );
    assert.equal(
      Math.round((standardEnd.getTime() - start.getTime()) / 86_400_000),
      90,
    );
    assert.equal(config.foundingDays, 180);
    assert.equal(config.standardDays, 90);
  });

  it("platform override merges onto market defaults", () => {
    const config = resolveTrialConfig({
      marketFeatureDefaults: { trial: { standardDays: 60 } },
      override: { foundingDays: 120, standardDays: 45 },
    });
    assert.equal(config.foundingDays, 120);
    assert.equal(config.standardDays, 45);
    assert.equal(config.minQualifyingVisits, DEFAULT_TRIAL_PACK.minQualifyingVisits);
  });

  it("activation progress qualifies at configured visit count", () => {
    const config = resolveTrialConfig({ override: { minQualifyingVisits: 20 } });
    assert.deepEqual(trialActivationProgress(19, config), {
      current: 19,
      required: 20,
      qualified: false,
    });
    assert.deepEqual(trialActivationProgress(20, config), {
      current: 20,
      required: 20,
      qualified: true,
    });
  });
});