import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PlanKey } from "@prisma/client";
import { PLAN_MATRIX, SPECIALTY_PACK_ADDONS } from "../entitlements/plans-matrix";

describe("CL-07 specialty packs", () => {
  it("exposes pack_dental and pack_aesthetics as purchasable add-ons (off by default on all plans)", () => {
    assert.ok(SPECIALTY_PACK_ADDONS.some((a) => a.key === "pack_dental"));
    assert.ok(SPECIALTY_PACK_ADDONS.some((a) => a.key === "pack_aesthetics"));
    for (const plan of Object.values(PlanKey)) {
      assert.equal(PLAN_MATRIX[plan].pack_dental, false);
      assert.equal(PLAN_MATRIX[plan].pack_aesthetics, false);
      assert.equal(PLAN_MATRIX[plan].pack_physio, false);
    }
  });
});
