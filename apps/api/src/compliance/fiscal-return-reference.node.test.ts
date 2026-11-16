import assert from "node:assert/strict";
import { FiscalSubmissionStatus } from "@prisma/client";
import { test } from "node:test";
import {
  saleReferenceUuidFromSubmission,
  saleReturnPrepareOutcomeFromSubmission,
} from "./fiscal-return-reference";
import type { EtaStoredSubmissionPayload } from "./eta-stored-submission";

test("saleReferenceUuidFromSubmission uses provider UUID when submitted", () => {
  const uuid = saleReferenceUuidFromSubmission({
    status: FiscalSubmissionStatus.SUBMITTED,
    providerDocumentUuid: "11111111-1111-1111-1111-111111111111",
    payloadJson: {},
  });
  assert.equal(uuid, "11111111-1111-1111-1111-111111111111");
});

test("saleReferenceUuidFromSubmission does not use in-flight sale uuid for returns", () => {
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
  assert.equal(uuid, undefined);
});

test("return prepare waits until sale is submitted", () => {
  const outcome = saleReturnPrepareOutcomeFromSubmission({
    status: FiscalSubmissionStatus.SUBMITTING,
    providerDocumentUuid: null,
    payloadJson: {},
  });
  assert.equal(outcome.action, "wait");
});

test("return prepare cancels when sale was rejected", () => {
  const outcome = saleReturnPrepareOutcomeFromSubmission({
    status: FiscalSubmissionStatus.REJECTED,
    providerDocumentUuid: null,
    payloadJson: {},
  });
  assert.equal(outcome.action, "cancel");
});

test("return prepare references accepted sale uuid", () => {
  const saleUuid = "22222222-2222-2222-2222-222222222222";
  const outcome = saleReturnPrepareOutcomeFromSubmission({
    status: FiscalSubmissionStatus.SUBMITTED,
    providerDocumentUuid: saleUuid,
    payloadJson: {},
  });
  assert.deepEqual(outcome, { action: "reference", uuid: saleUuid });
});