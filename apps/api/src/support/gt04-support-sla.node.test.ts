import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addBusinessHours,
  computeFirstResponseDueAt,
  DEFAULT_SUPPORT_SLA,
  measureFirstResponseSla,
  SUPPORT_MACROS,
  supportMacroById,
  zonedParts,
} from "./support-sla";

describe("GT-04 support first-response SLA", () => {
  it("uses Sun–Thu 09:00–18:00 Africa/Cairo and 4h for P1/URGENT", () => {
    assert.deepEqual(DEFAULT_SUPPORT_SLA.weekendDays, [5, 6]);
    assert.equal(DEFAULT_SUPPORT_SLA.openHour, 9);
    assert.equal(DEFAULT_SUPPORT_SLA.closeHour, 18);
    assert.equal(DEFAULT_SUPPORT_SLA.firstResponseHoursByPriority.URGENT, 4);
    // Sunday 10:00 Cairo → due 14:00 same day
    const sundayCairo10 = new Date("2026-11-15T08:00:00.000Z"); // 10:00 Cairo (UTC+2 in Nov)
    const parts = zonedParts(sundayCairo10, "Africa/Cairo");
    assert.equal(parts.weekday, 0);
    assert.equal(parts.hour, 10);
    const due = computeFirstResponseDueAt(sundayCairo10, "URGENT");
    const dueParts = zonedParts(due, "Africa/Cairo");
    assert.equal(dueParts.hour, 14);
    assert.equal(dueParts.day, parts.day);
  });

  it("skips Friday–Saturday when accumulating business hours", () => {
    // Thursday 17:00 Cairo → 1h left Thursday; Fri–Sat skipped; +3h Sunday morning (working)
    const thu17 = new Date("2026-11-19T15:00:00.000Z"); // 17:00 Cairo
    const due = addBusinessHours(thu17, 4);
    const p = zonedParts(due, "Africa/Cairo");
    assert.equal(p.weekday, 0); // Sunday
    assert.equal(p.hour, 12);
  });

  it("measures first response SLA breached vs met", () => {
    const created = new Date("2026-11-15T08:00:00.000Z");
    const onTime = measureFirstResponseSla({
      createdAt: created,
      priority: "URGENT",
      firstRespondedAt: new Date("2026-11-15T10:00:00.000Z"),
    });
    assert.equal(onTime.breached, false);
    assert.ok((onTime.responseMinutes ?? 0) > 0);

    const late = measureFirstResponseSla({
      createdAt: created,
      priority: "URGENT",
      firstRespondedAt: new Date("2026-11-15T14:00:00.000Z"),
    });
    assert.equal(late.breached, true);

    const openBreached = measureFirstResponseSla({
      createdAt: created,
      priority: "URGENT",
      firstRespondedAt: null,
      now: new Date("2026-11-16T08:00:00.000Z"),
    });
    assert.equal(openBreached.breached, true);
  });

  it("ships bilingual macros including engineering escalation", () => {
    assert.ok(SUPPORT_MACROS.length >= 4);
    const esc = supportMacroById("escalate_engineering");
    assert.ok(esc);
    assert.ok(esc!.bodyEn.length > 10);
    assert.ok(esc!.bodyAr.length > 5);
  });
});
