import assert from "node:assert/strict";
import test from "node:test";
import { findPlaybookMatch, tryPlaybookReply } from "./assistant-playbook";

test("playbook matches how-to with navigate action", () => {
  const nav = ["patients", "appointments", "encounters"];
  assert.ok(findPlaybookMatch("How do I register a patient?", nav));
  const res = tryPlaybookReply("How do I register a patient?", nav, "en");
  assert.ok(res?.reply.includes("1."));
  assert.equal(res?.actions?.[0]?.type, "navigate");
  assert.equal(res?.actions?.[0]?.href, "/patients");
});

test("open screen phrase", () => {
  const res = tryPlaybookReply("take me to appointments", ["appointments"], "en");
  assert.ok(res?.actions?.[0]?.href === "/appointments");
});
