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
test("FS-02 transfer reference errors are pinned to the field with a stable code and channel", () => {
  const body = (fn: () => void) => {
    try {
      fn();
    } catch (e) {
      return (e as { getResponse: () => Record<string, unknown> }).getResponse();
    }
    assert.fail("expected a 400");
  };
  const format = body(() => assertValidTransferReference("INSTAPAY", "@@bad@@", egMethods));
  assert.equal(format.errorCode, "TRANSFER_REFERENCE_FORMAT");
  assert.equal(format.field, "transferReference");
  assert.equal(format.messageKey, "errors.transfer.referenceFormat");
  assert.deepEqual(format.messageParams, { channel: "INSTAPAY" });
  const short = body(() => assertValidTransferReference("ORG_WALLET", "x", []));
  assert.equal(short.errorCode, "TRANSFER_REFERENCE_REQUIRED");
  assert.equal(short.field, "transferReference");
});
