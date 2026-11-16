import assert from "node:assert/strict";
import { FiscalSubmissionStatus } from "@prisma/client";
import { test } from "node:test";
import { submissionVoidFiscalAction } from "./void-revenue-fiscal-returns";

test("submissionVoidFiscalAction maps ETA submission states", () => {
  assert.equal(submissionVoidFiscalAction(undefined), "none");
  assert.equal(submissionVoidFiscalAction(FiscalSubmissionStatus.PENDING), "cancel_pending");
  assert.equal(submissionVoidFiscalAction(FiscalSubmissionStatus.SUBMITTING), "queue_return");
  assert.equal(submissionVoidFiscalAction(FiscalSubmissionStatus.SUBMITTED), "queue_return");
  assert.equal(submissionVoidFiscalAction(FiscalSubmissionStatus.ACCEPTED), "queue_return");
  assert.equal(submissionVoidFiscalAction(FiscalSubmissionStatus.REJECTED), "return_already_rejected");
  assert.equal(submissionVoidFiscalAction(FiscalSubmissionStatus.CANCELLED), "return_already_rejected");
});