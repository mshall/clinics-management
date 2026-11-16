import assert from "node:assert/strict";
import { test } from "node:test";
import type { EtaReceiptPayload } from "./eta-egypt.client";
import { computeEtaReceiptUuid } from "./eta-egypt-serialize";
import { buildEtaWireReceiptDocument } from "./eta-egypt-wire";
import { assertWireUuidMatchesContentHash } from "./eta-stored-submission";

/** Cross-check value from ETA SDK / toolkit for this exact fixture (fixed issue time). */
const GOLDEN_UUID = "322d148f562c8941db36ef30ca09d0bb1f3cc9b21779c15668c6c760023b1864";
const GOLDEN_ISSUED_AT = "2024-01-15T10:00:00Z";

const GOLDEN_PAYLOAD: EtaReceiptPayload = {
  issuerRin: "258797215",
  branchCode: "0",
  documentType: "R",
  receiptUuid: "",
  taxpayerActivityCode: "4620",
  lines: [
    {
      description: "Medical service",
      quantity: 1,
      unitPrice: 100,
      vatPercent: 0,
      currency: "EGP",
      itemCode: "EG-8690000000001",
    },
  ],
  totalAmount: 100,
  currency: "EGP",
  paymentMethod: "C",
  buyerName: "Ahmed Hassan",
  patientId: "golden-patient",
  clinicId: "golden-clinic",
  idempotencyKey: "eta-golden-fixture",
  documentNature: "sale",
};

const GOLDEN_DEVICE_SERIAL = "KIORLY-EG-GOLDEN-01";

test("ETA SDK golden fixture uuid matches toolkit hash", () => {
  const wire = buildEtaWireReceiptDocument({
    payload: GOLDEN_PAYLOAD,
    previousUUID: "",
    deviceSerial: GOLDEN_DEVICE_SERIAL,
    internalId: `${GOLDEN_DEVICE_SERIAL}-00000001`,
    issuedAt: GOLDEN_ISSUED_AT,
  });
  const forHash = { ...wire, header: { ...wire.header, uuid: "" } };
  const uuid = computeEtaReceiptUuid(forHash as unknown as Record<string, unknown>);
  assert.equal(uuid, GOLDEN_UUID);
  wire.header.uuid = uuid;
  assertWireUuidMatchesContentHash(wire);
});