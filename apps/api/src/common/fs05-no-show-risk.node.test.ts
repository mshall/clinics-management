import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AppointmentStatus } from "@prisma/client";
import { msUntilNextNightlyRun } from "../clinic-ai/no-show-risk.scheduler";
import {
  computeNoShowRisk,
  NO_SHOW_RISK_METHOD,
  noShowRiskBand,
  noShowRiskForAppointment,
  noShowRiskSuggestion,
} from "./no-show-risk";

const now = new Date("2026-12-01T08:00:00Z");
const inHours = (h: number) => new Date(now.getTime() + h * 3_600_000);

describe("FS-05 no-show risk (rule-based)", () => {
  it("is labelled RULE_BASED until a trained model ships", () => {
    assert.equal(NO_SHOW_RISK_METHOD, "RULE_BASED");
    const view = noShowRiskForAppointment(
      { status: AppointmentStatus.CONFIRMED, startsAt: inHours(48) },
      { noShowCount: 1, requiresAppointmentDeposit: false },
      { now, depositsAvailable: true },
    );
    assert.equal(view?.method, "RULE_BASED");
  });

  it("keeps the existing formula and explains which factors applied", () => {
    assert.deepEqual(computeNoShowRisk({ noShowCount: 0, requiresDeposit: false, hoursUntilStart: 48 }), { score: 5, factors: [] });
    assert.deepEqual(computeNoShowRisk({ noShowCount: 2, requiresDeposit: false, hoursUntilStart: 48 }), {
      score: 36,
      factors: ["PRIOR_NO_SHOWS"],
    });
    assert.deepEqual(computeNoShowRisk({ noShowCount: 3, requiresDeposit: true, hoursUntilStart: 2 }), {
      score: 74,
      factors: ["PRIOR_NO_SHOWS", "DEPOSIT_FLAG", "SHORT_NOTICE"],
    });
    assert.equal(computeNoShowRisk({ noShowCount: 9, requiresDeposit: true, hoursUntilStart: 1 }).score, 99);
  });

  it("maps scores to low / medium / high", () => {
    assert.equal(noShowRiskBand(5), "LOW");
    assert.equal(noShowRiskBand(29), "LOW");
    assert.equal(noShowRiskBand(30), "MEDIUM");
    assert.equal(noShowRiskBand(59), "MEDIUM");
    assert.equal(noShowRiskBand(60), "HIGH");
  });

  it("suggests a deposit (or an extra reminder) for high risk only", () => {
    assert.equal(noShowRiskSuggestion("MEDIUM", { requiresDeposit: false, depositsAvailable: true }), null);
    assert.equal(noShowRiskSuggestion("HIGH", { requiresDeposit: false, depositsAvailable: true }), "DEPOSIT");
    assert.equal(noShowRiskSuggestion("HIGH", { requiresDeposit: true, depositsAvailable: true }), "EXTRA_REMINDER");
    assert.equal(noShowRiskSuggestion("HIGH", { requiresDeposit: false, depositsAvailable: false }), "EXTRA_REMINDER");
  });

  it("only scores upcoming scheduled / confirmed appointments", () => {
    const p = { noShowCount: 3, requiresAppointmentDeposit: true };
    const ctx = { now, depositsAvailable: true };
    assert.equal(noShowRiskForAppointment({ status: AppointmentStatus.CHECKED_IN, startsAt: inHours(1) }, p, ctx), null);
    assert.equal(noShowRiskForAppointment({ status: AppointmentStatus.CANCELLED, startsAt: inHours(10) }, p, ctx), null);
    assert.equal(noShowRiskForAppointment({ status: AppointmentStatus.SCHEDULED, startsAt: inHours(-1) }, p, ctx), null);
    assert.equal(noShowRiskForAppointment({ status: AppointmentStatus.SCHEDULED, startsAt: inHours(10) }, p, ctx)?.band, "HIGH");
  });

  it("nightly job runs at the next 01:00 UTC", () => {
    assert.equal(msUntilNextNightlyRun(new Date("2026-12-01T00:30:00Z")), 30 * 60_000);
    assert.equal(msUntilNextNightlyRun(new Date("2026-12-01T01:00:00Z")), 24 * 3_600_000);
    assert.equal(msUntilNextNightlyRun(new Date("2026-12-01T08:00:00Z")), 17 * 3_600_000);
  });
});
