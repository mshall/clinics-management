import assert from "node:assert/strict";
import test from "node:test";
import { UserRole } from "@prisma/client";
import {
  messageAsksForPersonalRevenue,
  resolveAssistantRevenueIsPersonal,
} from "./assistant-revenue-scope";

test("physician income questions default to personal revenue", () => {
  assert.ok(messageAsksForPersonalRevenue("What is my gross and net income this month?"));
  assert.ok(
    resolveAssistantRevenueIsPersonal("income in November 2026", UserRole.PHYSICIAN, ["doctor_revenue", "patients"]),
  );
  assert.ok(
    !resolveAssistantRevenueIsPersonal(
      "organization revenue this month",
      UserRole.PHYSICIAN,
      ["doctor_revenue", "patients"],
    ),
  );
});
