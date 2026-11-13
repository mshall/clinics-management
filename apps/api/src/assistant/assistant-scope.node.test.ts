import assert from "node:assert/strict";
import test from "node:test";
import { messageAllowedForNav, requiredNavKeysForMessage } from "./assistant-scope";

test("hr topic requires hr tab", () => {
  const msg = "How do I add an employee?";
  assert.ok(requiredNavKeysForMessage(msg).includes("hr"));
  assert.equal(messageAllowedForNav(msg, ["patients", "profile"]), false);
  assert.equal(messageAllowedForNav(msg, ["hr", "profile"]), true);
});
