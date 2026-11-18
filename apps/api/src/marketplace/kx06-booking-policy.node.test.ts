import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AppointmentStatus, BookingSource } from "@prisma/client";
import { BadRequestException } from "@nestjs/common";
import { KIOREX_CANCELLATION_POLICY_DEFAULTS, DEFAULT_COMMERCIAL_CONFIG } from "../markets/commercial-config.schema";
import { clinicCancellationPatch } from "../appointments/kiorex-clinic-cancel";
import {
  POLICY_ERROR,
  evaluatePatientCancel,
  evaluatePatientReschedule,
  resolveKiorexCancellationPolicy,
} from "./kiorex-booking-policy";

const now = new Date("2027-03-01T08:00:00.000Z");
const at = (hours: number) => new Date(now.getTime() + hours * 3_600_000);
const policy = { patientCancelMinHours: 12, patientRescheduleMinHours: 6, depositRefundMinHours: 24, maxPatientReschedules: 1 };

describe("KX-06 booking policy", () => {
  it("falls back to pack defaults and overlays a partial clinic override", () => {
    assert.deepEqual(resolveKiorexCancellationPolicy(null, null), KIOREX_CANCELLATION_POLICY_DEFAULTS);
    const market = {
      ...DEFAULT_COMMERCIAL_CONFIG,
      kiorex: { ...DEFAULT_COMMERCIAL_CONFIG.kiorex, cancellationPolicy: policy },
    };
    assert.deepEqual(resolveKiorexCancellationPolicy(market, { patientCancelMinHours: 2 }), {
      ...policy,
      patientCancelMinHours: 2,
    });
    assert.deepEqual(resolveKiorexCancellationPolicy(market, { patientCancelMinHours: -1 }), policy);
  });

  it("patient cancel: closed inside the window, deposit refundable only before the refund cutoff", () => {
    const scheduled = AppointmentStatus.SCHEDULED;
    assert.deepEqual(evaluatePatientCancel(policy, { status: scheduled, startsAt: at(11) }, now), {
      allowed: false,
      code: POLICY_ERROR.CANCELLATION_WINDOW_CLOSED,
    });
    assert.deepEqual(evaluatePatientCancel(policy, { status: scheduled, startsAt: at(18) }, now), {
      allowed: true,
      depositRefundable: false,
    });
    assert.deepEqual(evaluatePatientCancel(policy, { status: AppointmentStatus.CONFIRMED, startsAt: at(30) }, now), {
      allowed: true,
      depositRefundable: true,
    });
    assert.deepEqual(evaluatePatientCancel(policy, { status: AppointmentStatus.CHECKED_IN, startsAt: at(30) }, now), {
      allowed: false,
      code: POLICY_ERROR.BOOKING_NOT_CHANGEABLE,
    });
  });

  it("patient reschedule: window and per-booking limit", () => {
    const base = { status: AppointmentStatus.CONFIRMED, startsAt: at(8), rescheduleCount: 0 };
    assert.equal(evaluatePatientReschedule(policy, base, now).allowed, true);
    assert.deepEqual(evaluatePatientReschedule(policy, { ...base, startsAt: at(5) }, now), {
      allowed: false,
      code: POLICY_ERROR.RESCHEDULE_WINDOW_CLOSED,
    });
    assert.deepEqual(evaluatePatientReschedule(policy, { ...base, rescheduleCount: 1 }, now), {
      allowed: false,
      code: POLICY_ERROR.RESCHEDULE_LIMIT_REACHED,
    });
  });

  it("clinic cancel of a Kiorex booking needs a reason and always refunds the deposit", () => {
    const kiorex = { status: AppointmentStatus.CONFIRMED, bookingSource: BookingSource.KIOREX_MARKETPLACE };
    assert.throws(() => clinicCancellationPatch(kiorex, AppointmentStatus.CANCELLED, " "), BadRequestException);
    assert.throws(
      () => clinicCancellationPatch({ ...kiorex, bookingSource: BookingSource.CLINIC_LINK }, AppointmentStatus.CANCELLED, ""),
      BadRequestException,
    );
    const patch = clinicCancellationPatch(kiorex, AppointmentStatus.CANCELLED, "Doctor is ill", now);
    assert.deepEqual(patch, {
      cancelledAt: now,
      cancelledBy: "CLINIC",
      cancellationReason: "Doctor is ill",
      depositRefundable: true,
    });
    const frontDesk = { status: AppointmentStatus.SCHEDULED, bookingSource: BookingSource.FRONT_DESK };
    assert.equal(clinicCancellationPatch(frontDesk, AppointmentStatus.CANCELLED, undefined, now)?.cancellationReason, null);
    assert.equal(clinicCancellationPatch(kiorex, AppointmentStatus.CHECKED_IN, undefined), null);
  });
});
