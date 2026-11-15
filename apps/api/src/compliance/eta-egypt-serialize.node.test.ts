import assert from "node:assert/strict";
import { test } from "node:test";
import { computeEtaReceiptUuid } from "./eta-egypt-serialize";

test("ETA uuid is 64-char hex from receipt content", () => {
  const doc = {
    header: { uuid: "", previousUUID: "", currency: "EGP", receiptNumber: "R1" },
    totalAmount: 100,
  };
  const uuid = computeEtaReceiptUuid(doc);
  assert.match(uuid, /^[a-f0-9]{64}$/);
  const uuid2 = computeEtaReceiptUuid(doc);
  assert.equal(uuid, uuid2);
});