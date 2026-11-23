import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  decide,
  loadQualityPolicyConfig,
  resolveStorageQualityEnabled,
} from "./quality-policy";

describe("quality-policy decide", () => {
  const cfg = loadQualityPolicyConfig();

  it("KEEP at exactly 4_194_304 bytes", () => {
    assert.deepEqual(decide({ sizeBytes: 4_194_304 }, cfg), {
      action: "KEEP",
      reason: "at_or_under_threshold",
    });
  });

  it("REDUCE at 4_194_305 bytes", () => {
    assert.deepEqual(decide({ sizeBytes: 4_194_305 }, cfg), {
      action: "REDUCE",
      reason: "over_threshold",
    });
  });

  it("KEEP under threshold", () => {
    assert.equal(decide({ sizeBytes: 3_900_000 }, cfg).action, "KEEP");
  });
});

describe("resolveStorageQualityEnabled", () => {
  it("defaults on for local/test and off for production/aws", () => {
    assert.equal(resolveStorageQualityEnabled({ nodeEnv: "development" }), true);
    assert.equal(resolveStorageQualityEnabled({ nodeEnv: "test" }), true);
    assert.equal(resolveStorageQualityEnabled({ nodeEnv: "production" }), false);
    assert.equal(resolveStorageQualityEnabled({ deployTarget: "aws" }), false);
  });

  it("env and tenant overrides win", () => {
    assert.equal(resolveStorageQualityEnabled({ env: "0", nodeEnv: "development" }), false);
    assert.equal(resolveStorageQualityEnabled({ env: "1", nodeEnv: "production" }), true);
    assert.equal(resolveStorageQualityEnabled({ tenantEnabled: true, nodeEnv: "production" }), true);
    assert.equal(resolveStorageQualityEnabled({ tenantEnabled: false, nodeEnv: "development" }), false);
  });
});
