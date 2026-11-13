import assert from "node:assert/strict";
import test from "node:test";
import { messageAsksForClinicList, messageAsksForRevenue } from "./assistant-intent";

test("detects clinic list questions", () => {
  assert.ok(messageAsksForClinicList("what are the list of clinics in this org?"));
  assert.ok(messageAsksForClinicList("List clinics"));
  assert.ok(!messageAsksForClinicList("hello"));
});

test("detects revenue questions", () => {
  assert.ok(messageAsksForRevenue("whats the revenue for this org for this month?"));
});
