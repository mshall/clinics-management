import assert from "node:assert/strict";
import { test } from "node:test";
import { assertValidTransferReference } from "./transfer-reference";
import type { MarketPaymentMethodDef } from "../markets/market-payment-methods";

const egMethods: MarketPaymentMethodDef[] = [
  { key: "INSTAPAY", transferChannel: "INSTAPAY", referencePattern: "^[A-Za-z0-9][A-Za-z0-9\\-_.]{5,31}$" },
  { key: "FAWRY", transferChannel: "FAWRY", referencePattern: "^[A-Za-z0-9]{8,20}$" },
];

test("assertValidTransferReference uses market reference patterns", () => {
  assert.doesNotThrow(() => assertValidTransferReference("INSTAPAY", "IP-8F92A1BC", egMethods));
  assert.throws(() => assertValidTransferReference("INSTAPAY", "ab", egMethods));
  assert.doesNotThrow(() => assertValidTransferReference("FAWRY", "FW12345678", egMethods));
});