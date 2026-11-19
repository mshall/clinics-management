import assert from "node:assert/strict";
import test from "node:test";
import { resolveMarketTaxLabels } from "./market-tax-labels";

test("resolveMarketTaxLabels applies Egypt defaults by market code", () => {
  const labels = resolveMarketTaxLabels({}, "EG");
  assert.match(labels.taxRegistrationLabelEn, /RIN/);
  assert.match(labels.taxAuthorityNameEn, /Egyptian Tax Authority/);
});

test("resolveMarketTaxLabels overrides from taxConfig JSON", () => {
  const labels = resolveMarketTaxLabels(
    { taxRegistrationLabelEn: "Custom TRN", licenseLabelEn: "Custom license" },
    "EG",
  );
  assert.equal(labels.taxRegistrationLabelEn, "Custom TRN");
  assert.equal(labels.licenseLabelEn, "Custom license");
  assert.match(labels.taxAuthorityNameEn, /Egyptian Tax Authority/);
});