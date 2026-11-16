import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyEtaHttpFailure } from "./eta-submit-classify";

test("401 and 403 are credentials, not permanent validation", () => {
  assert.equal(classifyEtaHttpFailure(401), "credentials");
  assert.equal(classifyEtaHttpFailure(403, "POS deactivated"), "credentials");
});

test("token context treats client errors as credentials", () => {
  assert.equal(classifyEtaHttpFailure(400, '{"error":"invalid_client"}', "token"), "credentials");
});

test("duplicate UUID responses are duplicate class", () => {
  assert.equal(classifyEtaHttpFailure(409), "duplicate");
  assert.equal(classifyEtaHttpFailure(400, "Receipt uuid already exists"), "duplicate");
});

test("422-style validation is permanent", () => {
  assert.equal(classifyEtaHttpFailure(400, "Invalid item code EG-xxx"), "permanent");
});

test("5xx stays temporary", () => {
  assert.equal(classifyEtaHttpFailure(502), "temporary");
});