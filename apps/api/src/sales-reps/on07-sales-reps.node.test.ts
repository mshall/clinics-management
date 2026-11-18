import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parsePeriod, repCommissionForInvoices, repOwnerConfirmPurpose } from "./sales-reps.service";

describe("ON-07 rep commission", () => {
  const asOf = new Date("2026-11-01T00:00:00Z");
  const cfg = { commissionPercent: 10, retentionDays: 90 };

  it("pays only on clinics retained past the retention window", () => {
    const r = repCommissionForInvoices(
      [
        { total: 1000, tenantCreatedAt: new Date("2026-06-01T00:00:00Z"), retained: true },
        { total: 500, tenantCreatedAt: new Date("2026-10-15T00:00:00Z"), retained: true },
        { total: 700, tenantCreatedAt: new Date("2026-01-01T00:00:00Z"), retained: false },
      ],
      cfg,
      asOf,
    );
    assert.deepEqual(r, { eligibleTotal: 1000, commission: 100, eligibleCount: 1 });
  });

  it("parses YYYY-MM periods as UTC month windows", () => {
    const p = parsePeriod("2026-02");
    assert.equal(p.from.toISOString(), "2026-02-01T00:00:00.000Z");
    assert.equal(p.to.toISOString(), "2026-03-01T00:00:00.000Z");
    assert.throws(() => parsePeriod("2026-13"));
  });

  it("scopes the owner OTP purpose to the tenant", () => {
    assert.equal(repOwnerConfirmPurpose("t1"), "REP_OWNER_CONFIRM:t1");
  });
});
