import assert from "node:assert/strict";
import { test } from "node:test";
import { buildFiscalIdempotencyKey } from "./fiscal-idempotency";
import { EtaEgyptFiscalProvider } from "../providers/fiscal/eta-egypt.fiscal-provider";

test("two visit fees with same amount get distinct fiscal idempotency keys", () => {
  const provider = "eta-egypt";
  const keyA = buildFiscalIdempotencyKey(provider, { kind: "revenue", id: "rev-patient-a" });
  const keyB = buildFiscalIdempotencyKey(provider, { kind: "revenue", id: "rev-patient-b" });
  assert.notEqual(keyA, keyB);
  assert.match(keyA, /rev-patient-a/);
  assert.match(keyB, /rev-patient-b/);
});

test("eta provider embeds queue idempotency key (not amount/description)", () => {
  const eta = new EtaEgyptFiscalProvider();
  const key = buildFiscalIdempotencyKey("eta-egypt", { kind: "revenue", id: "rev-001" });
  const built = eta.buildPayload({
    tenantId: "tenant-1",
    clinicId: "clinic-1",
    patientId: "patient-1",
    totalAmount: 1000,
    currency: "EGP",
    vatPercent: 0,
    description: "Visit fee, 1,000 EGP",
    taxConfig: { defaultActivityCode: "8690" },
    clinicOverrides: { taxRegistrationNumber: "123456789", branchCode: "B01" },
    idempotencyKey: key,
    receiptUuid: "00000000-0000-4000-8000-000000000001",
    documentNature: "sale",
  });
  assert.equal(built.idempotencyKey, key);
  const payload = built.payloadJson as { idempotencyKey: string; totalAmount: number };
  assert.equal(payload.idempotencyKey, key);
  assert.equal(payload.totalAmount, 1000);

  const key2 = buildFiscalIdempotencyKey("eta-egypt", { kind: "revenue", id: "rev-002" });
  const built2 = eta.buildPayload({
    tenantId: "tenant-1",
    clinicId: "clinic-1",
    patientId: "patient-2",
    totalAmount: 1000,
    currency: "EGP",
    vatPercent: 0,
    description: "Visit fee, 1,000 EGP",
    taxConfig: { defaultActivityCode: "8690" },
    clinicOverrides: { taxRegistrationNumber: "123456789", branchCode: "B01" },
    idempotencyKey: key2,
    receiptUuid: "00000000-0000-4000-8000-000000000002",
    documentNature: "sale",
  });
  assert.notEqual(built.idempotencyKey, built2.idempotencyKey);
});