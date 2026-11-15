import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultCurrencyForCountry } from "./country-default-currency";

test("Egypt defaults to EGP", () => {
  assert.equal(defaultCurrencyForCountry("EG"), "EGP");
  assert.equal(defaultCurrencyForCountry("eg"), "EGP");
});

test("unknown country falls back to EGP", () => {
  assert.equal(defaultCurrencyForCountry("XX"), "EGP");
});