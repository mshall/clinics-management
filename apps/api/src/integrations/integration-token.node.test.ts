import assert from "node:assert/strict";
import test from "node:test";
import {
  formatIntegrationBearerToken,
  generateClientKey,
  parseIntegrationBearerToken,
} from "./integration-token";

test("parseIntegrationBearerToken accepts formatted token", () => {
  const key = generateClientKey();
  const token = formatIntegrationBearerToken(key, "secret-part");
  const parsed = parseIntegrationBearerToken(token);
  assert.deepEqual(parsed, { clientKey: key, secret: "secret-part" });
});

test("parseIntegrationBearerToken rejects staff JWT", () => {
  assert.equal(parseIntegrationBearerToken("eyJhbGciOiJIUzI1NiJ9.abc"), null);
});
