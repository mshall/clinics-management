import assert from "node:assert/strict";
import { test } from "node:test";
import { PATIENT_PRIVACY_NOTICE_PATH } from "./patient-privacy-notice-link";

test("SC-02 patient privacy notice path", () => {
  assert.equal(PATIENT_PRIVACY_NOTICE_PATH, "/legal/patient_privacy_notice");
});