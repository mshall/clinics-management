import assert from "node:assert/strict";
import test from "node:test";
import { resolveLedgerListingRange, resolveReportingRange } from "./reporting-range";

test("resolveReportingRange uses current month when both bounds omitted", () => {
  const { start, end } = resolveReportingRange(undefined, undefined);
  assert.ok(start.getTime() <= end.getTime());
});

test("resolveLedgerListingRange never throws on partial or blank query params", () => {
  const a = resolveLedgerListingRange("", "2026-05-31");
  const b = resolveLedgerListingRange("2026-05-01", "");
  const c = resolveLedgerListingRange("not-a-date", "2026-05-31");
  for (const { start, end } of [a, b, c]) {
    assert.ok(start.getTime() <= end.getTime());
  }
});

test("resolveLedgerListingRange accepts valid inclusive pair", () => {
  const { start, end } = resolveLedgerListingRange("2026-05-01", "2026-05-31");
  assert.equal(start.getFullYear(), 2026);
  assert.equal(end.getFullYear(), 2026);
  assert.ok(start.getTime() < end.getTime());
});
