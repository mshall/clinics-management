import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException } from "@nestjs/common";
import {
  effectiveEmployeeSalaryCurrency,
  normalizeEmployeeSalaryCurrencyOverride,
} from "./employee-salary-currency";

test("effectiveEmployeeSalaryCurrency uses clinic default when override is null", () => {
  assert.equal(effectiveEmployeeSalaryCurrency(null, "SAR"), "SAR");
});

test("effectiveEmployeeSalaryCurrency uses stored override", () => {
  assert.equal(effectiveEmployeeSalaryCurrency("USD", "SAR"), "USD");
});

test("normalizeEmployeeSalaryCurrencyOverride stores null when matching clinic default", () => {
  assert.equal(normalizeEmployeeSalaryCurrencyOverride("AED", "AED"), null);
  assert.equal(normalizeEmployeeSalaryCurrencyOverride("AED", null), null);
});

test("normalizeEmployeeSalaryCurrencyOverride stores explicit different currency", () => {
  assert.equal(normalizeEmployeeSalaryCurrencyOverride("AED", "USD"), "USD");
});

test("normalizeEmployeeSalaryCurrencyOverride rejects invalid currency", () => {
  assert.throws(
    () => normalizeEmployeeSalaryCurrencyOverride("AED", "XYZ"),
    BadRequestException,
  );
});
