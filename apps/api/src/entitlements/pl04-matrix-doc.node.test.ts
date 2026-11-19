import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PlanKey } from "@prisma/client";
import { describe, it } from "node:test";
import {
  CONTROLLER_ENTITLEMENT_POLICIES,
  FEATURE_FLAG_ENTITLEMENT,
  NAV_TAB_ENTITLEMENT,
  PLAN_NAV_TAB_PRESETS,
  matrixModulePlanMarkdownRows,
  planEntitlementRowsForSeed,
} from "./plans-matrix";

const DOC = join(process.cwd(), "../../Docs/PLANS_AND_ENTITLEMENTS.md");
const WEB_NAV = join(process.cwd(), "../web/src/lib/plan-nav-entitlements.ts");

describe("PL-04 plans matrix", () => {
  it("seed rows match canonical matrix per plan", () => {
    const rows = planEntitlementRowsForSeed();
    for (const plan of Object.values(PlanKey)) {
      const keys = new Set(rows[plan].map((r) => r.key));
      assert.equal(keys.size, rows[plan].length, `duplicate keys in seed for ${plan}`);
      assert.ok(keys.has("mod_revenue"), `${plan} seed includes mod_revenue`);
    }
  });

  it("Docs/PLANS_AND_ENTITLEMENTS.md section 02 matches generated matrix", () => {
    const doc = readFileSync(DOC, "utf8");
    const start = doc.indexOf("<!-- MATRIX:START -->");
    const end = doc.indexOf("<!-- MATRIX:END -->");
    assert.ok(start >= 0 && end > start, "matrix markers missing in doc");
    const section = doc.slice(start, end);
    for (const row of matrixModulePlanMarkdownRows()) {
      assert.ok(section.includes(row), `doc missing matrix row: ${row}`);
    }
  });

  it("controller policies cover module entitlements", () => {
    const gated = Object.values(CONTROLLER_ENTITLEMENT_POLICIES).filter((p) => p.kind === "gated");
    assert.ok(gated.length >= 15, "expected most modules gated");
  });

  it("feature flags map to plan entitlements", () => {
    assert.equal(FEATURE_FLAG_ENTITLEMENT.ai_assistant, "ai_assistant");
    assert.equal(FEATURE_FLAG_ENTITLEMENT.whatsapp_reminders, "whatsapp_reminders");
    assert.equal(FEATURE_FLAG_ENTITLEMENT.card_payments, "card_payments");
  });

  it("nav tab map matches web mirror", () => {
    const webSrc = readFileSync(WEB_NAV, "utf8");
    for (const [tab, ent] of Object.entries(NAV_TAB_ENTITLEMENT)) {
      assert.ok(webSrc.includes(`${tab}: "${ent}"`), `web nav map missing ${tab}`);
    }
  });

  it("plan nav presets are defined for every plan tier", () => {
    for (const plan of Object.values(PlanKey)) {
      assert.ok(PLAN_NAV_TAB_PRESETS[plan].length >= 5, `${plan} nav preset`);
    }
    assert.ok(!PLAN_NAV_TAB_PRESETS[PlanKey.LITE].includes("operations"));
    assert.ok(PLAN_NAV_TAB_PRESETS[PlanKey.CLINIC].includes("operations"));
    assert.ok(PLAN_NAV_TAB_PRESETS[PlanKey.LITE].length <= 8, "Lite marketing cap");
  });
});