import assert from "node:assert/strict";
import test from "node:test";
import { EmployeeRecordStatus, UserRole } from "@prisma/client";
import {
  activeSchedulingPhysicianAndClauses,
  activeSchedulingPhysicianWhere,
} from "./active-scheduling-physician";

test("activeSchedulingPhysicianWhere excludes inactive and archived physicians", () => {
  const where = activeSchedulingPhysicianWhere("tenant-1");
  assert.equal(where.tenantId, "tenant-1");
  assert.equal(where.role, UserRole.PHYSICIAN);
  assert.equal(where.deletedAt, null);
  assert.equal(where.deactivatedAt, null);
  const activeEmployeeClause = (where.AND as object[])[0] as {
    OR: Array<{ employee: { is: null | { deletedAt: null; recordStatus: EmployeeRecordStatus } } }>;
  };
  assert.equal(activeEmployeeClause.OR.length, 2);
  assert.deepEqual(activeEmployeeClause.OR[1]?.employee.is, {
    deletedAt: null,
    recordStatus: EmployeeRecordStatus.ACTIVE,
  });
});

test("activeSchedulingPhysicianAndClauses adds clinic scope when provided", () => {
  const scoped = activeSchedulingPhysicianAndClauses(["c1", "c2"]);
  assert.equal(scoped.length, 2);
  const scopeClause = scoped[1] as { OR: Array<{ employee: { is: null | { clinicId: { in: string[] } } } }> };
  assert.deepEqual(scopeClause.OR[1]?.employee.is, { clinicId: { in: ["c1", "c2"] } });
});
