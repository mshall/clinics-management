import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  findInvalidClinicAllowlistIds,
  normalizeAllowedClinicIds,
} from "./integration-clinic-allowlist";

describe("integration clinic allowlist", () => {
  it("dedupes and trims clinic ids", () => {
    assert.deepEqual(normalizeAllowedClinicIds([" a ", "a", "", "b"]), ["a", "b"]);
    assert.deepEqual(normalizeAllowedClinicIds(undefined), []);
  });

  it("detects ids outside tenant", () => {
    const valid = new Set(["c1", "c2"]);
    assert.deepEqual(findInvalidClinicAllowlistIds(["c1"], valid), []);
    assert.deepEqual(findInvalidClinicAllowlistIds(["c1", "x"], valid), ["x"]);
  });
});
