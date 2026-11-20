import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatRevenueLedgerCategory } from "./locale-display";

const t = (key: string, fallback?: string): string => fallback ?? key;

describe("formatRevenueLedgerCategory", () => {
  it("maps visit fee categories to Encounter", () => {
    assert.equal(formatRevenueLedgerCategory("VISIT_FEE", t), "Encounter");
    assert.equal(formatRevenueLedgerCategory("VISIT", t), "Encounter");
    assert.equal(formatRevenueLedgerCategory("APPOINTMENT_FEE", t), "Encounter");
  });

  it("maps operation payments to Operation or Operation down payment", () => {
    assert.equal(formatRevenueLedgerCategory("OPERATION_PAYMENT", t, "Operation payment · Jane"), "Operation");
    assert.equal(
      formatRevenueLedgerCategory("OPERATION_PAYMENT", t, "Operation down payment · Jane · Dr X"),
      "Operation down payment",
    );
  });
});
