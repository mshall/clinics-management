import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PlanKey } from "@prisma/client";
import {
  PLAN_NAV_TAB_PRESETS,
  applyPlanNavPipeline,
  intersectNavTabsWithPlanPreset,
  requiredPlanForNavTab,
  sidebarNavCountForPlan,
} from "./plan-nav-preset";

describe("PL-06 plan nav presets", () => {
  it("Lite exposes at most eight sidebar tabs", () => {
    assert.ok(PLAN_NAV_TAB_PRESETS[PlanKey.LITE].length <= 8);
    assert.equal(sidebarNavCountForPlan(PlanKey.LITE), 7);
    assert.ok(!PLAN_NAV_TAB_PRESETS[PlanKey.LITE].includes("hr"));
    assert.ok(!PLAN_NAV_TAB_PRESETS[PlanKey.LITE].includes("operations"));
  });

  it("effective nav is role grant intersected with plan preset", () => {
    const roleTabs = [
      "dashboard",
      "patients",
      "encounters",
      "appointments",
      "operations",
      "hr",
      "admin",
      "reports",
      "profile",
    ];
    const lite = intersectNavTabsWithPlanPreset(roleTabs, PlanKey.LITE);
    assert.ok(lite.includes("dashboard"));
    assert.ok(!lite.includes("hr"));
    assert.ok(!lite.includes("operations"));
    assert.ok(!lite.includes("reports"));
  });

  it("entitlements filter removes revenue on Lite when mod_revenue false", () => {
    const liteTabs = [...PLAN_NAV_TAB_PRESETS[PlanKey.LITE]];
    const filtered = applyPlanNavPipeline(liteTabs, PlanKey.LITE, { mod_revenue: false });
    assert.ok(!filtered.includes("revenue"));
  });

  it("required plan escalates for operations to Clinic", () => {
    assert.equal(requiredPlanForNavTab("operations"), PlanKey.CLINIC);
    assert.equal(requiredPlanForNavTab("reports"), PlanKey.PRO);
  });
});