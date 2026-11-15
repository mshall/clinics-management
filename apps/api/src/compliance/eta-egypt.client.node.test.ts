import assert from "node:assert/strict";
import { test } from "node:test";
import { buildIdempotencyKey, signEtaPayload, type EtaReceiptPayload } from "./eta-egypt.client";

const samplePayload = (): EtaReceiptPayload => ({
  issuerRin: "123456789",
  branchCode: "branch01",
  documentType: "EI",
  taxpayerActivityCode: "8690",
  lines: [{ description: "Visit", quantity: 1, unitPrice: 200, vatPercent: 14, currency: "EGP" }],
  totalAmount: 200,
  currency: "EGP",
  patientId: "pat1",
  clinicId: "clinic1",
  idempotencyKey: buildIdempotencyKey(["t1", "rev1", "", "", "200", "EGP"]),
});

test("signEtaPayload is stable when ETA_SIGNING_KEY is set", () => {
  const key = process.env.ETA_SIGNING_KEY;
  process.env.ETA_SIGNING_KEY = "test-secret";
  const a = signEtaPayload(samplePayload());
  const b = signEtaPayload(samplePayload());
  assert.equal(a, b);
  assert.match(a, /^[a-f0-9]{64}$/);
  if (key === undefined) delete process.env.ETA_SIGNING_KEY;
  else process.env.ETA_SIGNING_KEY = key;
});