import assert from "node:assert/strict";
import { test } from "node:test";
import { AppointmentStatus } from "@prisma/client";
import { buildRevertCheckInPatch, isRevertingAppointmentCheckIn } from "./appointment-check-in-revert";

test("reverting check-in only from CHECKED_IN to scheduled or confirmed", () => {
  assert.equal(
    isRevertingAppointmentCheckIn(AppointmentStatus.CHECKED_IN, AppointmentStatus.CONFIRMED),
    true,
  );
  assert.equal(
    isRevertingAppointmentCheckIn(AppointmentStatus.CHECKED_IN, AppointmentStatus.SCHEDULED),
    true,
  );
  assert.equal(
    isRevertingAppointmentCheckIn(AppointmentStatus.CONFIRMED, AppointmentStatus.SCHEDULED),
    false,
  );
  assert.equal(
    isRevertingAppointmentCheckIn(AppointmentStatus.CHECKED_IN, AppointmentStatus.COMPLETED),
    false,
  );
});

test("revert patch clears queue and check-in fields", () => {
  const patch = buildRevertCheckInPatch(AppointmentStatus.CONFIRMED);
  assert.equal(patch.status, AppointmentStatus.CONFIRMED);
  assert.equal(patch.queueTicketNumber, null);
  assert.equal(patch.checkedInAt, null);
  assert.equal(patch.queueStage, null);
});