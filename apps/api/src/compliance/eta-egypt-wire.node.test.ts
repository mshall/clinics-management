import assert from "node:assert/strict";
import { test } from "node:test";
import { buildEtaWireReceiptDocument } from "./eta-egypt-wire";
import type { EtaReceiptPayload } from "./eta-egypt.client";

test("wire document v1.2 includes buyer, tax totals, payment method, and uuid chain fields", () => {
  const payload: EtaReceiptPayload = {
    issuerRin: "123456789",
    branchCode: "B1",
    documentType: "R",
    receiptUuid: "aa".repeat(32),
    previousReceiptUuid: "bb".repeat(32),
    taxpayerActivityCode: "8690",
    lines: [{ description: "Visit", quantity: 1, unitPrice: 100, vatPercent: 0, currency: "EGP" }],
    totalAmount: 100,
    currency: "EGP",
    paymentMethod: "C",
    buyerName: "Patient",
    patientId: "p1",
    clinicId: "c1",
    idempotencyKey: "eta-egypt:revenue:r1",
    documentNature: "sale",
  };
  const wire = buildEtaWireReceiptDocument({
    payload,
    previousUUID: payload.previousReceiptUuid!,
    deviceSerial: "POS-001",
    internalId: payload.idempotencyKey,
  });
  assert.equal(wire.documentTypeVersion, "1.2");
  assert.equal(wire.header.uuid, payload.receiptUuid);
  assert.equal(wire.header.previousUUID, payload.previousReceiptUuid);
  assert.equal(wire.buyer.type, "P");
  assert.equal(wire.paymentMethod, "C");
  assert.ok(wire.taxTotals.length >= 1);
  assert.equal(wire.itemData[0]?.unitType, "EA");
  assert.equal(wire.deviceSerialNumber, "POS-001");
});