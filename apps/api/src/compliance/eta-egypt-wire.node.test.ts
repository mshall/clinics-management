import assert from "node:assert/strict";
import { test } from "node:test";
import { buildEtaWireReceiptDocument } from "./eta-egypt-wire";
import type { EtaReceiptPayload } from "./eta-egypt.client";

test("wire document includes header uuid chain", () => {
  const payload: EtaReceiptPayload = {
    issuerRin: "123456789",
    branchCode: "B1",
    documentType: "R",
    receiptUuid: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    previousReceiptUuid: "11111111-2222-3333-4444-555555555555",
    taxpayerActivityCode: "8690",
    lines: [{ description: "Visit", quantity: 1, unitPrice: 100, vatPercent: 0, currency: "EGP" }],
    totalAmount: 100,
    currency: "EGP",
    patientId: "p1",
    clinicId: "c1",
    idempotencyKey: "eta-egypt:revenue:r1",
    documentNature: "sale",
  };
  const wire = buildEtaWireReceiptDocument(payload);
  assert.equal(wire.header.uuid, payload.receiptUuid);
  assert.equal(wire.header.previousUUID, payload.previousReceiptUuid);
  assert.equal(wire.documentType, "r");
});