import assert from "node:assert/strict";
import { test } from "node:test";
import {
  OPERATION_DOCUMENT_CATEGORIES,
  operationDocumentUploadKind,
} from "./operation-document-categories";

test("operation document categories include consent and operation report", () => {
  assert.ok(OPERATION_DOCUMENT_CATEGORIES.includes("CONSENT"));
  assert.ok(OPERATION_DOCUMENT_CATEGORIES.includes("OPERATION_REPORT"));
});

test("maps consent and operation report to API kinds for create and post-surgery", () => {
  assert.equal(operationDocumentUploadKind("CONSENT", "pre"), "CONSENT");
  assert.equal(operationDocumentUploadKind("CONSENT", "post"), "CONSENT");
  assert.equal(operationDocumentUploadKind("OPERATION_REPORT", "pre"), "OPERATION_NOTE");
  assert.equal(operationDocumentUploadKind("OPERATION_REPORT", "post"), "OPERATION_NOTE");
  assert.equal(operationDocumentUploadKind("LAB_RESULTS", "pre"), "ATTACHMENT");
  assert.equal(operationDocumentUploadKind("LAB_RESULTS", "post"), "POST_SURGERY");
  assert.equal(operationDocumentUploadKind("OTHER", "post"), "POST_SURGERY");
});
