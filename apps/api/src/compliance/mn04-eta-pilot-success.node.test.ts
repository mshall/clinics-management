import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FiscalSubmissionStatus } from "@prisma/client";
import {
  computeEtaPilotSuccess,
  ETA_PILOT_SUCCESS_THRESHOLD,
  isManualFiscalIntervention,
  pilotWeekOneWindow,
} from "./eta-pilot-success";

describe("MN-04 ETA pilot week-1 success rate", () => {
  it("counts VALID automatic submissions toward ≥ 95% gate", () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({
      id: String(i),
      clinicId: "c1",
      submittedAt: new Date(),
      status: FiscalSubmissionStatus.SUBMITTED,
      providerValidationStatus: i < 19 ? "VALID" : "INVALID",
      idempotencyKey: `eta-egypt:payment:p-${i}`,
    }));
    const sum = computeEtaPilotSuccess(rows);
    assert.equal(sum.submittedCount, 20);
    assert.equal(sum.validCount, 19);
    assert.equal(sum.successRate, 0.95);
    assert.equal(sum.meetsPilotCriterion, true);
    assert.ok(sum.successRate! >= ETA_PILOT_SUCCESS_THRESHOLD);
  });

  it("excludes manual resubmit idempotency keys from the pilot denominator", () => {
    const auto = {
      id: "a1",
      clinicId: "c1",
      submittedAt: new Date(),
      status: FiscalSubmissionStatus.SUBMITTED,
      providerValidationStatus: "VALID",
      idempotencyKey: "eta-egypt:payment:p-1",
    };
    const manual = {
      id: "m1",
      clinicId: "c1",
      submittedAt: new Date(),
      status: FiscalSubmissionStatus.SUBMITTED,
      providerValidationStatus: "VALID",
      idempotencyKey: "eta-egypt:resubmit:sub-1",
    };
    assert.ok(isManualFiscalIntervention(manual.idempotencyKey));
    const sum = computeEtaPilotSuccess([auto, manual]);
    assert.equal(sum.submittedCount, 1);
    assert.equal(sum.manualInterventionCount, 1);
    assert.equal(sum.successRate, 1);
  });

  it("fails pilot criterion below 95% VALID", () => {
    const rows = [
      {
        id: "1",
        clinicId: "c1",
        submittedAt: new Date(),
        status: FiscalSubmissionStatus.SUBMITTED,
        providerValidationStatus: "VALID",
        idempotencyKey: "k1",
      },
      {
        id: "2",
        clinicId: "c1",
        submittedAt: new Date(),
        status: FiscalSubmissionStatus.SUBMITTED,
        providerValidationStatus: "INVALID",
        idempotencyKey: "k2",
      },
    ];
    const sum = computeEtaPilotSuccess(rows);
    assert.equal(sum.successRate, 0.5);
    assert.equal(sum.meetsPilotCriterion, false);
  });

  it("pilotWeekOneWindow spans seven days from production start", () => {
    const start = new Date("2026-01-01T00:00:00.000Z");
    const window = pilotWeekOneWindow(start, new Date("2026-01-03T00:00:00.000Z"));
    assert.ok(window);
    assert.equal(window!.from.toISOString(), start.toISOString());
    assert.equal(window!.to.toISOString(), "2026-01-03T00:00:00.000Z");
  });
});