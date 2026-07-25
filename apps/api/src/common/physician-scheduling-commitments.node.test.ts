import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException } from "@nestjs/common";
import { AppointmentStatus, OperationStatus, UserRole } from "@prisma/client";
import {
  PHYSICIAN_HAS_ACTIVE_BOOKINGS_ERROR,
  assertPhysicianHasNoActiveSchedulingCommitments,
} from "./physician-scheduling-commitments";

test("allows lifecycle changes for non-physicians and physicians without bookings", async () => {
  const db = {
    appointment: { count: async () => 0 },
    operation: { count: async () => 0 },
  };
  await assertPhysicianHasNoActiveSchedulingCommitments(db, "t1", "u1", UserRole.NURSE);
  await assertPhysicianHasNoActiveSchedulingCommitments(db, "t1", "u1", UserRole.PHYSICIAN);
});

test("blocks lifecycle changes when physician has active appointment bookings", async () => {
  const db = {
    appointment: {
      count: async (args: {
        where: { tenantId: string; clinicianId: string; status: { in: AppointmentStatus[] } };
      }) => {
        assert.equal(args.where.clinicianId, "doc-1");
        assert.deepEqual(args.where.status.in, [
          AppointmentStatus.SCHEDULED,
          AppointmentStatus.CONFIRMED,
          AppointmentStatus.CHECKED_IN,
        ]);
        return 2;
      },
    },
    operation: { count: async () => 0 },
  };
  await assert.rejects(
    () => assertPhysicianHasNoActiveSchedulingCommitments(db, "t1", "doc-1", UserRole.PHYSICIAN),
    (err: unknown) => {
      assert.ok(err instanceof BadRequestException);
      const response = err.getResponse() as { message: string[]; error: string };
      assert.equal(response.error, PHYSICIAN_HAS_ACTIVE_BOOKINGS_ERROR);
      assert.match(response.message.join(" "), /2 appointment booking/);
      return true;
    },
  );
});

test("blocks lifecycle changes when physician has scheduled operations", async () => {
  const db = {
    appointment: { count: async () => 0 },
    operation: {
      count: async (args: { where: { status: OperationStatus } }) => {
        assert.equal(args.where.status, OperationStatus.SCHEDULED);
        return 1;
      },
    },
  };
  await assert.rejects(
    () => assertPhysicianHasNoActiveSchedulingCommitments(db, "t1", "doc-1", UserRole.PHYSICIAN),
    BadRequestException,
  );
});
