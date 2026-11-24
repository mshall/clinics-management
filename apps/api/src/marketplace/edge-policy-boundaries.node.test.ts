import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AppointmentStatus } from "@prisma/client";
import { POLICY_ERROR, evaluatePatientCancel, evaluatePatientReschedule } from "./kiorex-booking-policy";

/**
 * EDGE-41: the exact edges of the cancellation / reschedule / deposit-refund windows, with an injected clock (no wall time).
 * Convention under test: a window is open AT its minimum (hours until start == min is allowed) and the deposit is refundable AT its cutoff.
 */
const now = new Date("2027-03-28T22:00:00.000Z"); // the evening before the Egypt DST switch (last Friday of April in 2027 is later; the instant maths must not care about zones)
const policy = { patientCancelMinHours: 12, patientRescheduleMinHours: 6, depositRefundMinHours: 24, maxPatientReschedules: 2 };
const startIn = (ms: number) => new Date(now.getTime() + ms);
const H = 3_600_000;
const sched = AppointmentStatus.SCHEDULED;

describe("EDGE-41 cancellation window edges", () => {
  it("cancel: 1 ms inside the window is closed, exactly at the minimum is open", () => {
    assert.deepEqual(evaluatePatientCancel(policy, { status: sched, startsAt: startIn(12 * H - 1) }, now), { allowed: false, code: POLICY_ERROR.CANCELLATION_WINDOW_CLOSED });
    assert.equal(evaluatePatientCancel(policy, { status: sched, startsAt: startIn(12 * H) }, now).allowed, true);
  });
  it("deposit refund: 1 ms short of the cutoff keeps the deposit, exactly at the cutoff refunds", () => {
    assert.deepEqual(evaluatePatientCancel(policy, { status: sched, startsAt: startIn(24 * H - 1) }, now), { allowed: true, depositRefundable: false });
    assert.deepEqual(evaluatePatientCancel(policy, { status: sched, startsAt: startIn(24 * H) }, now), { allowed: true, depositRefundable: true });
  });
  it("an appointment already started or in the past can never be cancelled by the patient (negative hours)", () => {
    assert.equal(evaluatePatientCancel(policy, { status: sched, startsAt: startIn(0) }, now).allowed, false);
    assert.equal(evaluatePatientCancel(policy, { status: sched, startsAt: startIn(-H) }, now).allowed, false);
  });
  it("a zero-hour window allows cancelling right up to the start instant but not after it", () => {
    const open = { ...policy, patientCancelMinHours: 0 };
    assert.equal(evaluatePatientCancel(open, { status: sched, startsAt: startIn(0) }, now).allowed, true);
    assert.equal(evaluatePatientCancel(open, { status: sched, startsAt: startIn(-1) }, now).allowed, false);
  });
  it("a 168 h (7 day) window across a 25 h DST day is measured in elapsed hours, not calendar days", () => {
    const week = { ...policy, patientCancelMinHours: 168 };
    assert.equal(evaluatePatientCancel(week, { status: sched, startsAt: startIn(168 * H) }, now).allowed, true);
    assert.equal(evaluatePatientCancel(week, { status: sched, startsAt: startIn(167 * H + 59 * 60_000) }, now).allowed, false);
  });
  it("terminal and checked-in appointments are not changeable at all", () => {
    for (const status of [AppointmentStatus.CHECKED_IN, AppointmentStatus.COMPLETED, AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW]) {
      assert.equal(evaluatePatientCancel(policy, { status, startsAt: startIn(100 * H) }, now).allowed, false, status);
    }
  });
});

describe("EDGE-41 reschedule window and limit edges", () => {
  const appt = { status: sched, startsAt: startIn(6 * H), rescheduleCount: 0 };
  it("reschedule: at the minimum is open, 1 ms inside is closed", () => {
    assert.equal(evaluatePatientReschedule(policy, appt, now).allowed, true);
    assert.deepEqual(evaluatePatientReschedule(policy, { ...appt, startsAt: startIn(6 * H - 1) }, now), { allowed: false, code: POLICY_ERROR.RESCHEDULE_WINDOW_CLOSED });
  });
  it("the reschedule count limit: count == max-1 still allowed, count == max refused; max 0 never allows", () => {
    assert.equal(evaluatePatientReschedule(policy, { ...appt, rescheduleCount: 1 }, now).allowed, true);
    assert.deepEqual(evaluatePatientReschedule(policy, { ...appt, rescheduleCount: 2 }, now), { allowed: false, code: POLICY_ERROR.RESCHEDULE_LIMIT_REACHED });
    assert.equal(evaluatePatientReschedule({ ...policy, maxPatientReschedules: 0 }, appt, now).allowed, false);
  });
  it("the window is checked before the count (a closed window reports RESCHEDULE_WINDOW_CLOSED even at the limit)", () => {
    assert.deepEqual(evaluatePatientReschedule(policy, { ...appt, startsAt: startIn(H), rescheduleCount: 9 }, now), { allowed: false, code: POLICY_ERROR.RESCHEDULE_WINDOW_CLOSED });
  });
});
