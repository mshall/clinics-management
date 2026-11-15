import assert from "node:assert/strict";
import { test, describe } from "node:test";
import { MoneyTransferChannel } from "@prisma/client";
import { assertValidTransferReference } from "./transfer-reference";

describe("assertValidTransferReference", () => {
  test("accepts plausible InstaPay IDs", () => {
    assert.doesNotThrow(() => assertValidTransferReference(MoneyTransferChannel.INSTAPAY, "IP-8F92A1BC"));
  });

  test("rejects short InstaPay IDs", () => {
    assert.throws(() => assertValidTransferReference(MoneyTransferChannel.INSTAPAY, "ab"));
  });

  test("accepts Fawry references", () => {
    assert.doesNotThrow(() => assertValidTransferReference(MoneyTransferChannel.FAWRY, "FW12345678"));
  });
});