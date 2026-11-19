import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { matchRemittanceLines } from "./claims";

describe("MN-05 remittance auto-match", () => {
  it("matches ≥ 90% of remittance lines by externalRef in test data", () => {
    const claims = Array.from({ length: 10 }, (_, i) => ({
      id: `cl-${i + 1}`,
      externalRef: `INV-2026-${String(i + 1).padStart(3, "0")}`,
      amountClaimed: 100 + i * 10,
      status: "SUBMITTED",
    }));
    // 9 exact refs + 1 unknown → 90%
    const rows = [
      ...claims.slice(0, 9).map((c) => ({ externalRef: c.externalRef, amount: c.amountClaimed })),
      { externalRef: "UNKNOWN-999", amount: 50 },
    ];
    const { matches, matchedRatio } = matchRemittanceLines(claims, rows);
    assert.equal(matches.filter((m) => m.status === "MATCHED").length, 9);
    assert.ok(matchedRatio >= 0.9, `expected ≥0.9 got ${matchedRatio}`);
  });

  it("falls back to unique amount when ref is missing", () => {
    const claims = [
      { id: "a", externalRef: "A", amountClaimed: 250, status: "SUBMITTED" },
      { id: "b", externalRef: "B", amountClaimed: 400, status: "SUBMITTED" },
    ];
    const { matches } = matchRemittanceLines(claims, [{ externalRef: "typo", amount: 250 }]);
    assert.equal(matches[0]?.status, "MATCHED");
    assert.equal(matches[0]?.claimLineId, "a");
  });
});
