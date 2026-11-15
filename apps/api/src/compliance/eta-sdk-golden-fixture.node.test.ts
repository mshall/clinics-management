import assert from "node:assert/strict";
import { test } from "node:test";
import type { EtaReceiptPayload } from "./eta-egypt.client";
import { computeEtaReceiptUuid } from "./eta-egypt-serialize";
import { buildEtaWireReceiptDocument } from "./eta-egypt-wire";

/**
 * Canonical Receipt v1.2 fixture for cross-check with ETA SDK / toolkit UUID API.
 * Re-verify in ETA pre-production when serialization rules change.
 * @see https://sdk.invoicing.eta.gov.eg/document-serialization-approach/
 */
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

test("ETA SDK golden fixture uuid is stable (verify against ETA toolkit)", () => {
  const wire = buildEtaWireReceiptDocument({
    payload: GOLDEN_PAYLOAD,
    previousUUID: "",
    deviceSerial: GOLDEN_DEVICE_SERIAL,
    internalId: "00000001",
  });
  const forHash = { ...wire, header: { ...wire.header, uuid: "" } };
  const uuid = computeEtaReceiptUuid(forHash as unknown as Record<string, unknown>);
  assert.match(uuid, /^[a-f0-9]{64}$/);

  const again = computeEtaReceiptUuid(forHash as unknown as Record<string, unknown>);
  assert.equal(uuid, again);

  const expectedFromEnv = process.env.ETA_GOLDEN_UUID_EXPECTED?.trim().toLowerCase();
  if (expectedFromEnv) {
    assert.equal(uuid, expectedFromEnv, "UUID mismatch vs ETA toolkit — update fixture or serialization");
  }
});

/** Run with ETA_GOLDEN_UUID_EXPECTED set after ETA SDK/toolkit cross-check in pre-production. */