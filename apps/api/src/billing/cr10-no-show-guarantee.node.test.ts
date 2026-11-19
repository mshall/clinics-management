import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NO_SHOW_GUARANTEE_DEFAULTS, resolveNoShowGuaranteeConfig } from "../markets/commercial-config.schema";
import {
  calculateNoShowGuarantee,
  outcomeStats,
  reductionPercent,
} from "./no-show-guarantee";

describe("CR-10 no-show guarantee", () => {
  it("is disabled by default via market config", () => {
    assert.equal(NO_SHOW_GUARANTEE_DEFAULTS.enabled, false);
    assert.equal(resolveNoShowGuaranteeConfig({}).enabled, false);
    assert.equal(resolveNoShowGuaranteeConfig({ noShowGuarantee: { enabled: true } }).enabled, true);
  });

  it("calculates reproducible rates and reduction from appointment outcomes", () => {
    const activated = new Date("2026-01-01T00:00:00.000Z");
    const rows = [];
    // Baseline days 0–30: 80 completed + 20 no-show → 20%
    for (let i = 0; i < 80; i++) {
      rows.push({ status: "COMPLETED", startsAt: new Date(activated.getTime() + i * 3600_000) });
    }
    for (let i = 0; i < 20; i++) {
      rows.push({ status: "NO_SHOW", startsAt: new Date(activated.getTime() + (80 + i) * 3600_000) });
    }
    // Eval days 30–120: 90 completed + 10 no-show → ~10% → 50% reduction
    const day31 = new Date(activated.getTime() + 31 * 86_400_000);
    for (let i = 0; i < 90; i++) {
      rows.push({ status: "COMPLETED", startsAt: new Date(day31.getTime() + i * 3600_000) });
    }
    for (let i = 0; i < 10; i++) {
      rows.push({ status: "NO_SHOW", startsAt: new Date(day31.getTime() + (90 + i) * 3600_000) });
    }

    const now = new Date(activated.getTime() + 120 * 86_400_000);
    const config = { ...NO_SHOW_GUARANTEE_DEFAULTS, enabled: true, minBaselineAppointments: 100 };
    const calc = calculateNoShowGuarantee(rows, activated, now, config);

    assert.equal(calc.baseline.appointments, 100);
    assert.equal(calc.baseline.noShows, 20);
    assert.equal(calc.baseline.rate, 20);
    assert.equal(calc.evaluation.appointments, 100);
    assert.equal(calc.evaluation.rate, 10);
    assert.equal(calc.reductionPercent, 50);
    assert.equal(calc.met, true);
    assert.equal(reductionPercent(20, 10), 50);
    assert.deepEqual(outcomeStats([{ status: "CANCELLED", startsAt: activated }]), {
      appointments: 0,
      noShows: 0,
      rate: 0,
    });
  });

  it("is not eligible below min baseline appointments", () => {
    const activated = new Date("2026-01-01T00:00:00.000Z");
    const rows = Array.from({ length: 50 }, (_, i) => ({
      status: i % 5 === 0 ? "NO_SHOW" : "COMPLETED",
      startsAt: new Date(activated.getTime() + i * 3600_000),
    }));
    const now = new Date(activated.getTime() + 120 * 86_400_000);
    const calc = calculateNoShowGuarantee(rows, activated, now, {
      ...NO_SHOW_GUARANTEE_DEFAULTS,
      enabled: true,
    });
    assert.equal(calc.baselineEligible, false);
    assert.equal(calc.met, false);
  });
});
