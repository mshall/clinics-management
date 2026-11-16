import assert from "node:assert/strict";
import { FiscalSubmissionStatus } from "@prisma/client";
import { test } from "node:test";
import { saleReferenceUuidFromSubmission } from "./fiscal-return-reference";
import type { EtaStoredSubmissionPayload } from "./eta-stored-submission";

test("saleReferenceUuidFromSubmission uses provider UUID when submitted", () => {
  const uuid = saleReferenceUuidFromSubmission({
    status: FiscalSubmissionStatus.SUBMITTED,
    providerDocumentUuid: "11111111-1111-1111-1111-111111111111",
    payloadJson: {},
  });
  assert.equal(uuid, "11111111-1111-1111-1111-111111111111");
});

test("saleReferenceUuidFromSubmission uses prepared wire uuid while sale is still in flight", () => {
  const stored = {
    schemaVersion: "eta-wire-v1",
    receiptUuid: "22222222-2222-2222-2222-222222222222",
    receiptNumber: 5,
    wireDocument: {},
  } as EtaStoredSubmissionPayload;
  const uuid = saleReferenceUuidFromSubmission({
    status: FiscalSubmissionStatus.SUBMITTING,
    providerDocumentUuid: null,
    payloadJson: stored,
  });
  assert.equal(uuid, "22222222-2222-2222-2222-222222222222");
});

test("return draft defers reference until prepare when returnForFiscalDocumentId is set", () => {
  const saleUuid = "22222222-2222-2222-2222-222222222222";
  const stored = {
    schemaVersion: "eta-wire-v1",
    receiptUuid: saleUuid,
    receiptNumber: 1,
    wireDocument: {},
  } as EtaStoredSubmissionPayload;
  const preparedReference = saleReferenceUuidFromSubmission({
    status: FiscalSubmissionStatus.SUBMITTED,
    providerDocumentUuid: saleUuid,
    payloadJson: stored,
  });
  assert.equal(preparedReference, saleUuid);
});