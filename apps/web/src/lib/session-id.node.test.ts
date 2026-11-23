import assert from "node:assert/strict";
import { test } from "node:test";
import { sessionIdFromAccessToken } from "./session-id";

const jwt = (payload: object) => `h.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.s`;

test("sessionIdFromAccessToken reads the sid claim", () => {
  assert.equal(sessionIdFromAccessToken(jwt({ sid: "sess_1", sub: "u" })), "sess_1");
});

test("sessionIdFromAccessToken is null for missing, malformed or sid-less tokens", () => {
  assert.equal(sessionIdFromAccessToken(null), null);
  assert.equal(sessionIdFromAccessToken("garbage"), null);
  assert.equal(sessionIdFromAccessToken(jwt({ sub: "u" })), null);
  assert.equal(sessionIdFromAccessToken(jwt({ sid: 5 })), null);
});
