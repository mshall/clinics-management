import assert from "node:assert/strict";
import { test } from "node:test";
import {
  parseMarketTaxPack,
  requireMarketTaxPack,
  tenantCreateDefaultsFromMarket,
  validateTrnForMarketPack,
} from "./market-tax-pack";
import type { Market } from "@prisma/client";

const egPack = {
  invoiceVatPercent: 0,
  saasVatPercent: 14,
  defaultVisitFee: 300,
  trnFormat: "^[0-9]{9}$",
  trnRequired: true,
};

const aePack = {
  invoiceVatPercent: 5,
  saasVatPercent: 5,
  defaultVisitFee: 250,
  trnFormat: null,
  trnRequired: false,
};

test("parseMarketTaxPack reads required keys and legacy defaultVatPercent", () => {
  assert.deepEqual(parseMarketTaxPack(egPack), {
    invoiceVatPercent: 0,
    saasVatPercent: 14,
    defaultVisitFee: 300,
    trnFormat: "^[0-9]{9}$",
    trnRequired: true,
  });
  assert.deepEqual(parseMarketTaxPack({ defaultVatPercent: 5, saasVatPercent: 5, defaultVisitFee: 1 }), {
    invoiceVatPercent: 5,
    saasVatPercent: 5,
    defaultVisitFee: 1,
    trnFormat: null,
    trnRequired: false,
  });
  assert.equal(parseMarketTaxPack({}), null);
});

test("tenantCreateDefaultsFromMarket uses pack not column defaults", () => {
  const market = {
    id: "market-egypt",
    code: "EG",
    hostCell: "frankfurt",
    taxConfig: egPack,
  } as unknown as Market;
  const created = tenantCreateDefaultsFromMarket(market);
  assert.equal(created.deploymentCell, "frankfurt");
  assert.equal(created.defaultVisitFee, 300);
  assert.equal(created.defaultInvoiceVatPercent, 0);
  assert.equal(created.defaultTaxRegistrationNumber, null);
});

test("EG TRN validation", () => {
  const pack = requireMarketTaxPack({ code: "EG", taxConfig: egPack });
  assert.equal(validateTrnForMarketPack("123456789", pack).ok, true);
  const bad = validateTrnForMarketPack("abc", pack);
  assert.equal(bad.ok, false);
  if (!bad.ok) {
    assert.match(bad.messageEn, /TRN/);
    assert.match(bad.messageAr, /TRN/);
  }
});

test("dummy second market pack provisions independently", () => {
  const market = {
    id: "market-uae-test",
    code: "AE",
    hostCell: "dubai",
    taxConfig: aePack,
  } as unknown as Market;
  const created = tenantCreateDefaultsFromMarket(market);
  assert.equal(created.defaultInvoiceVatPercent, 5);
  assert.equal(created.defaultVisitFee, 250);
  assert.equal(created.deploymentCell, "dubai");
});