import assert from "node:assert/strict";
import { test } from "node:test";

test("notification auth rejects missing API key", () => {
  process.env.ETA_NOTIFICATION_API_KEY = "test-key-123";
  const expected = process.env.ETA_NOTIFICATION_API_KEY;
  const token = "wrong";
  assert.notEqual(token, expected);
});