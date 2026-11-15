import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultCurrencyForCountry } from "./country-default-currency";

test("Egypt maps to EGP", () => {
  assert.equal(defaultCurrencyForCountry("EG"), "EGP");
  assert.equal(defaultCurrencyForCountry("eg"), "EGP");
});

test("unknown country returns null (no hidden fallback)", () => {
  assert.equal(defaultCurrencyForCountry("XX"), null);
  assert.equal(defaultCurrencyForCountry(""), null);
});