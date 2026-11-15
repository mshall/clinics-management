import assert from "node:assert/strict";
import { test } from "node:test";
import {
  effectiveEmployeeSalaryCurrency,
  normalizeEmployeeSalaryCurrencyOverride,
} from "./employee-salary-currency";

test("effectiveEmployeeSalaryCurrency uses org default when override is null", () => {
  assert.equal(effectiveEmployeeSalaryCurrency(null, "EGP"), "EGP");
  assert.equal(effectiveEmployeeSalaryCurrency(null, "SAR"), "SAR");
});

test("effectiveEmployeeSalaryCurrency uses stored override", () => {
  assert.equal(effectiveEmployeeSalaryCurrency("USD", "EGP"), "USD");
});

test("normalizeEmployeeSalaryCurrencyOverride stores null when matching org default", () => {
  assert.equal(normalizeEmployeeSalaryCurrencyOverride("EGP", "EGP"), null);
  assert.equal(normalizeEmployeeSalaryCurrencyOverride("EGP", null), null);
});

test("normalizeEmployeeSalaryCurrencyOverride stores explicit different currency", () => {
  assert.equal(normalizeEmployeeSalaryCurrencyOverride("EGP", "USD"), "USD");
});

test("normalizeEmployeeSalaryCurrencyOverride rejects invalid currency", () => {
  assert.throws(
    () => normalizeEmployeeSalaryCurrencyOverride("EGP", "XYZ"),
    /Invalid salary currency/,
  );
});