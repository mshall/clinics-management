import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveAppointmentFeeUpdateIntent } from "./appointment-fee-update-gate";

describe("resolveAppointmentFeeUpdateIntent", () => {
  it("ignores fee payload when the actor cannot edit fees (call center check-in)", () => {
    const intent = resolveAppointmentFeeUpdateIntent(false, {
      feeAmount: 0,
      scheduledFeeCollection: { mode: "CASH_ON_VISIT" },
    });
    assert.deepEqual(intent, { applyFeeAmount: false, applyScheduled: false });
  });

  it("applies fee fields when the actor can edit fees", () => {
    const intent = resolveAppointmentFeeUpdateIntent(true, {
      feeAmount: 250,
      scheduledFeeCollection: { mode: "CASH_ON_VISIT" },
    });
    assert.deepEqual(intent, { applyFeeAmount: true, applyScheduled: true });
  });

  it("does not treat missing feeAmount as an apply when can edit", () => {
    const intent = resolveAppointmentFeeUpdateIntent(true, {
      scheduledFeeCollection: { mode: "MONEY_TRANSFER", transferChannel: "instapay" },
    });
    assert.deepEqual(intent, { applyFeeAmount: false, applyScheduled: true });
  });
});
