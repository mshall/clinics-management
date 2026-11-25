import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NOT_SET_VIEW, effectiveRateAt, rateViewProblems, type RateHistoryRow, type RateSpecView } from "./commission-rate-view";

/** COM-2 provider-side rate view (pure). Every number is a TEST placeholder. */
const pct: RateSpecView = { feeType: "PERCENT", percentBps: 1000, flatMinor: null, minMinor: null, maxMinor: null, mode: null };
const flat: RateSpecView = { feeType: "FLAT", percentBps: null, flatMinor: 4000, minMinor: null, maxMinor: null, mode: "INVOICE_AND_COLLECT" };
const row = (o: Partial<RateHistoryRow> & { version: number; effectiveFrom: string }): RateHistoryRow => ({ scope: "DEFAULT", kind: "RATE", reason: null, spec: pct, ...o });
const at = (s: string) => new Date(s);

describe("effectiveRateAt", () => {
  it("no history is NOT_SET: no commission is charged and the page says so", () => {
    assert.deepEqual(effectiveRateAt([], at("2026-12-01T00:00:00Z")), NOT_SET_VIEW);
  });
  it("a default applies from its start only", () => {
    const h = [row({ version: 1, effectiveFrom: "2026-12-01T00:00:00Z" })];
    assert.equal(effectiveRateAt(h, at("2026-11-30T23:59:59Z")).state, "NOT_SET");
    assert.deepEqual(effectiveRateAt(h, at("2026-12-01T00:00:00Z")), { state: "SET", source: "DEFAULT", version: 1, effectiveFrom: "2026-12-01T00:00:00Z", reason: null, spec: pct });
  });
  it("a future-dated change takes effect by itself and the old instant keeps the old rate", () => {
    const h = [row({ version: 1, effectiveFrom: "2026-01-01T00:00:00Z" }), row({ version: 2, effectiveFrom: "2026-06-01T00:00:00Z", spec: flat })];
    assert.equal(effectiveRateAt(h, at("2026-05-31T00:00:00Z")).spec?.feeType, "PERCENT");
    assert.equal(effectiveRateAt(h, at("2026-06-01T00:00:00Z")).spec?.feeType, "FLAT");
  });
  it("the organisation's override wins, INHERIT hands back to the default, and the reason is shown", () => {
    const h = [
      row({ version: 1, effectiveFrom: "2026-01-01T00:00:00Z" }),
      row({ version: 1, scope: "ORG", effectiveFrom: "2026-03-01T00:00:00Z", spec: flat, reason: "negotiated" }),
      row({ version: 2, scope: "ORG", kind: "INHERIT", effectiveFrom: "2026-09-01T00:00:00Z", spec: null, reason: "ended" }),
    ];
    assert.deepEqual([effectiveRateAt(h, at("2026-02-01T00:00:00Z")).source, effectiveRateAt(h, at("2026-04-01T00:00:00Z")).source, effectiveRateAt(h, at("2026-09-02T00:00:00Z")).source], ["DEFAULT", "OVERRIDE", "DEFAULT"]);
    assert.equal(effectiveRateAt(h, at("2026-04-01T00:00:00Z")).reason, "negotiated");
  });
});

describe("rateViewProblems", () => {
  const ok = { orgRef: "t1", product: "CLINIC", version: "1700000000000", history: [{ version: 1, scope: "DEFAULT", kind: "RATE", effectiveFrom: "2026-12-01T00:00:00Z", reason: null, spec: pct }] };
  it("accepts a well-formed view", () => assert.deepEqual(rateViewProblems(ok), []));
  it("refuses a malformed one whole", () => {
    assert.ok(rateViewProblems(null).length);
    assert.ok(rateViewProblems({ ...ok, product: "HOTEL" }).length);
    assert.ok(rateViewProblems({ ...ok, version: 5 }).length);
    assert.ok(rateViewProblems({ ...ok, history: "x" }).length);
    assert.ok(rateViewProblems({ ...ok, history: [{ ...ok.history[0], effectiveFrom: "nope" }] }).length);
    assert.ok(rateViewProblems({ ...ok, history: [{ ...ok.history[0], spec: { feeType: "TIERED" } }] }).length);
  });
});
