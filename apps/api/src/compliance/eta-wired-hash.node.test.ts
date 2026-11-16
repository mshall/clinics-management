import assert from "node:assert/strict";
import { test } from "node:test";
import type { EtaReceiptPayload } from "./eta-egypt.client";
import { buildEtaWireReceiptDocument } from "./eta-egypt-wire";
import { computeEtaReceiptUuid } from "./eta-egypt-serialize";
import { assertWireUuidMatchesContentHash, type EtaStoredSubmissionPayload } from "./eta-stored-submission";

const FIXTURE_PAYLOAD: EtaReceiptPayload = {
  issuerRin: "258797215",
  branchCode: "0",
  documentType: "R",
  receiptUuid: "",
  taxpayerActivityCode: "4620",
  lines: [
    {
      description: "Consultation",
      quantity: 1,
      unitPrice: 250,
      vatPercent: 0,
      currency: "EGP",
      itemCode: "EG-8690000000001",
    },
  ],
  totalAmount: 250,
  currency: "EGP",
  paymentMethod: "V",
  buyerName: "Sara Mohamed",
  patientId: "p1",
  clinicId: "c1",
  idempotencyKey: "wire-hash-test",
  documentNature: "sale",
};

const ISSUED_AT = "2024-06-01T12:30:00Z";
const DEVICE = "POS-UNIT-TEST-01";
const INTERNAL = `${DEVICE}-00000042`;

test("stored wire document uuid matches content hash (empty uuid field)", () => {
  const wire = buildEtaWireReceiptDocument({
    payload: FIXTURE_PAYLOAD,
    previousUUID: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    deviceSerial: DEVICE,
    internalId: INTERNAL,
    issuedAt: ISSUED_AT,
  });
  wire.header.uuid = "placeholder-will-replace";
  const forHash = { ...wire, header: { ...wire.header, uuid: "" } };
  wire.header.uuid = computeEtaReceiptUuid(forHash as unknown as Record<string, unknown>);
  assertWireUuidMatchesContentHash(wire);

  const stored: EtaStoredSubmissionPayload = {
    schemaVersion: "eta-wire-v1",
    wireDocument: wire,
    receiptUuid: wire.header.uuid,
    receiptNumber: 42,
  };
  assert.equal(stored.wireDocument.dateTimeIssued, ISSUED_AT);
  assert.equal(stored.wireDocument.header.dateTimeIssued, ISSUED_AT);
  assert.equal(stored.wireDocument.deviceSerialNumber, DEVICE);
  assert.equal(stored.wireDocument.internalID, INTERNAL);
});