import assert from "node:assert/strict";
import test from "node:test";
import {
  messageAsksForClinicList,
  messageAsksForEmployeeCount,
  messageAsksForOrgUsers,
  messageAsksForRevenue,
} from "./assistant-intent";

test("detects clinic list questions", () => {
  assert.ok(messageAsksForClinicList("what are the list of clinics in this org?"));
  assert.ok(messageAsksForClinicList("List clinics"));
  assert.ok(!messageAsksForClinicList("hello"));
});

test("detects revenue questions", () => {
  assert.ok(messageAsksForRevenue("whats the revenue for this org for this month?"));
});

test("detects employee count questions", () => {
  assert.ok(messageAsksForEmployeeCount("how many employees do we have in the organization?"));
  assert.ok(!messageAsksForOrgUsers("how many employees do we have in the organization?"));
});

test("detects organization user count questions", () => {
  assert.ok(messageAsksForOrgUsers("how many organization user accounts?"));
});
