import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveReportingRange } from "./reporting-range";
import { resolveStaffPerformanceRange } from "./insights-range";

test("resolveStaffPerformanceRange matches resolveReportingRange for YYYY-MM-DD bounds", () => {
  const fromStr = "2025-11-01";
  const toStr = "2025-11-30";
  const staff = resolveStaffPerformanceRange(fromStr, toStr);
  const report = resolveReportingRange(fromStr, toStr);
  assert.equal(staff.from.getTime(), report.start.getTime());
  assert.equal(staff.to.getTime(), report.end.getTime());
});