import assert from "node:assert/strict";
import test from "node:test";
import { FEATURE_FLAG_KEYS } from "./feature-flag-keys";

test("product feature flag keys are stable", () => {
  assert.deepEqual(FEATURE_FLAG_KEYS, [
    "eta_receipts",
    "whatsapp_reminders",
    "instapay",
    "fawry",
    "card_payments",
    "ai_assistant",
  ]);
});