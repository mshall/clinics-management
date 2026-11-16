import assert from "node:assert/strict";
import { test } from "node:test";
import { FinancialVisibilityOverride } from "@prisma/client";
import { moneyEditFromOverride, moneyVisibilityFromOverride } from "./money-access-override";

test("granular overrides for visibility", () => {
  assert.equal(
    moneyVisibilityFromOverride(FinancialVisibilityOverride.SHOW_VISIBILITY_AND_EDIT, false),
    true,
  );
  assert.equal(moneyVisibilityFromOverride(FinancialVisibilityOverride.SHOW_VISIBILITY_ONLY, false), true);
  assert.equal(moneyVisibilityFromOverride(FinancialVisibilityOverride.SHOW_EDIT_ONLY, false), false);
  assert.equal(moneyVisibilityFromOverride(FinancialVisibilityOverride.HIDE_VISIBILITY_ONLY, true), false);
  assert.equal(moneyVisibilityFromOverride(FinancialVisibilityOverride.HIDE_EDIT_ONLY, true), true);
});

test("granular overrides for fee edit", () => {
  assert.equal(moneyEditFromOverride(FinancialVisibilityOverride.SHOW_VISIBILITY_AND_EDIT, false), true);
  assert.equal(moneyEditFromOverride(FinancialVisibilityOverride.SHOW_EDIT_ONLY, false), true);
  assert.equal(moneyEditFromOverride(FinancialVisibilityOverride.SHOW_VISIBILITY_ONLY, false), false);
  assert.equal(moneyEditFromOverride(FinancialVisibilityOverride.HIDE_EDIT_ONLY, true), false);
  assert.equal(moneyEditFromOverride(FinancialVisibilityOverride.HIDE_VISIBILITY_ONLY, false), false);
});