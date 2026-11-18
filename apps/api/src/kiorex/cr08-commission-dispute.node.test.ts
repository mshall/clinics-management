import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { disputeSlaDueAt } from "./commission-dispute-sla";

describe("CR-08 dispute SLA", () => {
  it("due after three working days excluding Fri/Sat", () => {
    const created = new Date("2026-06-01T09:00:00Z"); // Monday
    const due = disputeSlaDueAt(created, [5, 6]);
    assert.equal(due.getUTCDay(), 4); // Thursday
    assert.equal(created < due, true);
    assert.equal(new Date("2026-06-03T09:00:00Z") > due, false);
    assert.equal(new Date("2026-06-05T09:00:00Z") > due, true);
  });
});