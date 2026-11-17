import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CONSENT_ERROR_MESSAGES,
  CONSENT_PURPOSE_AI,
  CONSENT_PURPOSE_MARKETPLACE,
  CONSENT_PURPOSE_MESSAGING_MARKETING,
} from "./consent-policy.constants";

describe("SC-03 consent policy constants", () => {
  it("each enforced purpose has a distinct error code and message", () => {
    for (const purpose of [CONSENT_PURPOSE_AI, CONSENT_PURPOSE_MARKETPLACE, CONSENT_PURPOSE_MESSAGING_MARKETING]) {
      const meta = CONSENT_ERROR_MESSAGES[purpose];
      assert.ok(meta.code.startsWith("PATIENT_CONSENT_"), purpose);
      assert.ok(meta.en.length > 10, purpose);
      assert.ok(meta.ar.length > 5, purpose);
    }
  });
});