import assert from "node:assert/strict";
import test from "node:test";
import { findQaAnswer, isSmallTalkOrMeta } from "./assistant-qa";

test("small talk returns capability path", () => {
  assert.ok(isSmallTalkOrMeta("What can you help with?"));
  assert.ok(!isSmallTalkOrMeta("What is TRN?"));
});

test("conceptual encounter question for physician nav", () => {
  const reply = findQaAnswer("What is an encounter?", ["encounters", "profile"], "en");
  assert.ok(reply?.includes("clinical visit"));
});

test("blocks HR conceptual answer without hr tab", () => {
  const reply = findQaAnswer("How do I add an employee?", ["patients", "profile"], "en");
  assert.equal(reply, null);
});
