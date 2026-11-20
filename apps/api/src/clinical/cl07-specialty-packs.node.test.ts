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
      assert.equal(PLAN_MATRIX[plan].pack_physio, plan === PlanKey.ENTERPRISE, "physio is an add-on, included in Enterprise (KX-05 §07)");
    }
  });

  it("physio pack: EGP 300/month is a PROPOSED price flagged NEEDS_HUMAN, behind the launch-locked template flag", () => {
    const p = SPECIALTY_PACK_ADDONS.find((a) => a.key === "pack_physio")!;
    assert.deepEqual([p.monthlyAmount, p.currency, p.priceStatus, p.needsHuman], [300, "EGP", "PROPOSED", "NEEDS_HUMAN"]);
    assert.deepEqual([...p.addOnFor], ["LITE", "PRO", "CLINIC"]);
    assert.equal(p.flagKey, "clinic.specialty_templates.physio");
    assert.ok(p.nameAr.trim());
  });
});
