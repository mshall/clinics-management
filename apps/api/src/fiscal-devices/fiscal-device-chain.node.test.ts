import assert from "node:assert/strict";
import { test } from "node:test";
import { computeEtaReceiptUuid } from "../compliance/eta-egypt-serialize";
import { buildEtaWireReceiptDocument } from "../compliance/eta-egypt-wire";
import type { EtaReceiptPayload } from "../compliance/eta-egypt.client";
import { EtaEgyptFiscalProvider } from "../providers/fiscal/eta-egypt.fiscal-provider";

function wireFor(payload: EtaReceiptPayload, previous: string, receiptNumber: string, serial: string) {
  const ctx = {
    payload,
    previousUUID: previous,
    deviceSerial: serial,
    internalId: `${serial}-${receiptNumber.padStart(8, "0")}`,
  };
  return buildEtaWireReceiptDocument(ctx);
}

test("concurrent device chain: second receipt previousUUID equals first content uuid", () => {
  const provider = new EtaEgyptFiscalProvider();
  const base: EtaReceiptPayload = {
    issuerRin: "123456789",
    branchCode: "B1",
    documentType: "R",
    receiptUuid: "",
    taxpayerActivityCode: "8690",
    lines: [{ description: "Fee", quantity: 1, unitPrice: 100, vatPercent: 0, currency: "EGP" }],
    totalAmount: 100,
    currency: "EGP",
    patientId: "p1",
    clinicId: "c1",
    idempotencyKey: "eta:pay:1",
    documentNature: "sale",
  };
  const serial = "KIORLY-EG-CLIN01-01";
  const w1 = wireFor(base, "", "00000001", serial);
  const uuid1 = provider.computeDocumentUuid!({ ...w1, header: { ...w1.header, uuid: "" } }, "");

  const base2 = { ...base, idempotencyKey: "eta:pay:2", totalAmount: 200, lines: [{ ...base.lines[0], unitPrice: 200 }] };
  const w2 = wireFor(base2, uuid1, "00000002", serial);
  const uuid2 = provider.computeDocumentUuid!({ ...w2, header: { ...w2.header, uuid: "" } }, uuid1);

  assert.notEqual(uuid1, uuid2);
  assert.equal(w2.header.previousUUID, uuid1);
  assert.match(uuid1, /^[a-f0-9]{64}$/);
  assert.equal(computeEtaReceiptUuid({ a: 1 }), computeEtaReceiptUuid({ a: 1 }));
});