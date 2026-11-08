import assert from "node:assert/strict";
import test from "node:test";
import { clampInsightsRange, MAX_INSIGHTS_RANGE_MS, parseInsightsRange } from "./insights-range";

test("parseInsightsRange defaults to ~30 days", () => {
  const { from, to } = parseInsightsRange();
  const span = to.getTime() - from.getTime();
  assert.ok(span >= 29 * 24 * 60 * 60 * 1000);
  assert.ok(span <= 31 * 24 * 60 * 60 * 1000);
});

test("clampInsightsRange caps span at one year", () => {
  const to = new Date("2026-06-01T00:00:00.000Z");
  const from = new Date("2020-01-01T00:00:00.000Z");
  const { from: f, to: t } = clampInsightsRange(from, to);
  assert.equal(t.getTime(), to.getTime());
  assert.equal(t.getTime() - f.getTime(), MAX_INSIGHTS_RANGE_MS);
});

test("clampInsightsRange swaps inverted bounds", () => {
  const a = new Date("2026-01-10T00:00:00.000Z");
  const b = new Date("2026-01-01T00:00:00.000Z");
  const { from, to } = clampInsightsRange(a, b);
  assert.ok(from.getTime() < to.getTime());
});
