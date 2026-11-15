import assert from "node:assert/strict";
import { test } from "node:test";
import type { EtaReceiptPayload } from "./eta-egypt.client";
import { computeEtaReceiptUuid } from "./eta-egypt-serialize";
import { buildEtaWireReceiptDocument } from "./eta-egypt-wire";

const basePayload: EtaReceiptPayload = {
  issuerRin: "123456789",
  branchCode: "B1",
  documentType: "R",
  receiptUuid: "",
  taxpayerActivityCode: "8690",
  lines: [{ description: "Consultation", quantity: 1, unitPrice: 500, vatPercent: 14, currency: "EGP", itemCode: "EG-8690000000001" }],
  totalAmount: 500,
  currency: "EGP",
  paymentMethod: "C",
  buyerName: "Patient",
  patientId: "p1",
  clinicId: "c1",
  idempotencyKey: "eta-egypt:revenue:rev-test-1",
  documentNature: "sale",
};

function wireForHash(payload: EtaReceiptPayload, previousUUID: string, deviceSerial: string) {
  const wire = buildEtaWireReceiptDocument({
    payload: { ...payload, receiptUuid: "" },
    previousUUID,
    deviceSerial,
    internalId: payload.idempotencyKey,
  });
  return { ...wire, header: { ...wire.header, uuid: "" } };
}

test("Receipt v1.2 builder sets documentTypeVersion and hashes uuid from content", () => {
  const wire = buildEtaWireReceiptDocument({
    payload: basePayload,
    previousUUID: "",
    deviceSerial: "POS-SERIAL-7",
    internalId: basePayload.idempotencyKey,
  });
  assert.equal(wire.documentTypeVersion, "1.2");
  assert.equal(wire.deviceSerialNumber, "POS-SERIAL-7");
  assert.equal(wire.header.uuid, "");

  const forHash = wireForHash(basePayload, "", "POS-SERIAL-7");
  const uuid = computeEtaReceiptUuid(forHash as unknown as Record<string, unknown>);
  assert.match(uuid, /^[a-f0-9]{64}$/);
  wire.header.uuid = uuid;
  assert.equal(wire.header.uuid, uuid);
});

test("per-device chain: different previousUUID yields different content-hash uuid", () => {
  const a = computeEtaReceiptUuid(wireForHash(basePayload, "", "POS-1") as unknown as Record<string, unknown>);
  const b = computeEtaReceiptUuid(
    wireForHash(basePayload, "a".repeat(64), "POS-1") as unknown as Record<string, unknown>,
  );
  assert.notEqual(a, b);
});

test("per-device chain: same content on different device serial yields different uuid", () => {
  const a = computeEtaReceiptUuid(wireForHash(basePayload, "", "POS-1") as unknown as Record<string, unknown>);
  const b = computeEtaReceiptUuid(wireForHash(basePayload, "", "POS-2") as unknown as Record<string, unknown>);
  assert.notEqual(a, b);
});