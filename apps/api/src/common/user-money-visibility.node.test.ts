import assert from "node:assert/strict";
import { test } from "node:test";
import { FinancialVisibilityOverride, UserRole } from "@prisma/client";
import {
  DEFAULT_MONEY_VISIBILITY_OVERRIDES,
  appointmentFinancialsVisible,
  canEditAppointmentFeesForViewer,
  canEditEncounterFeesForViewer,
  canEditOperationFeesForViewer,
  encounterFinancialsVisible,
  invoiceFinancialsVisible,
  operationRowFinancialsVisible,
} from "./user-money-visibility";

const callCenter = {
  userId: "cc-1",
  tenantId: "t1",
  email: "cc@test.com",
  role: UserRole.CALL_CENTER,
};

const receptionist = {
  userId: "rec-1",
  tenantId: "t1",
  email: "rec@test.com",
  role: UserRole.RECEPTIONIST,
};

test("call center does not see encounter or appointment money by role default", () => {
  const overrides = { ...DEFAULT_MONEY_VISIBILITY_OVERRIDES };
  assert.equal(encounterFinancialsVisible(callCenter, "phy-1", overrides), false);
  assert.equal(appointmentFinancialsVisible(callCenter, "phy-1", overrides), false);
  assert.equal(canEditEncounterFeesForViewer(callCenter, "phy-1", overrides), false);
  assert.equal(canEditAppointmentFeesForViewer(callCenter, "phy-1", overrides), false);
  assert.equal(canEditOperationFeesForViewer(callCenter, overrides), false);
});

test("receptionist still sees encounter money by default", () => {
  const overrides = { ...DEFAULT_MONEY_VISIBILITY_OVERRIDES };
  assert.equal(encounterFinancialsVisible(receptionist, "phy-1", overrides), true);
});

test("show visibility only grants view not edit for call center", () => {
  const overrides = {
    ...DEFAULT_MONEY_VISIBILITY_OVERRIDES,
    appointments: FinancialVisibilityOverride.SHOW_VISIBILITY_ONLY,
    encounters: FinancialVisibilityOverride.SHOW_VISIBILITY_ONLY,
    operations: FinancialVisibilityOverride.SHOW_VISIBILITY_ONLY,
  };
  assert.equal(appointmentFinancialsVisible(callCenter, "phy-1", overrides), true);
  assert.equal(encounterFinancialsVisible(callCenter, "phy-1", overrides), true);
  assert.equal(operationRowFinancialsVisible(callCenter, "phy-1", overrides), true);
  assert.equal(canEditAppointmentFeesForViewer(callCenter, "phy-1", overrides), false);
  assert.equal(canEditEncounterFeesForViewer(callCenter, "phy-1", overrides), false);
  assert.equal(canEditOperationFeesForViewer(callCenter, overrides), false);
});

test("show edit only grants edit not view for call center on operations row", () => {
  const overrides = {
    ...DEFAULT_MONEY_VISIBILITY_OVERRIDES,
    operations: FinancialVisibilityOverride.SHOW_EDIT_ONLY,
  };
  assert.equal(operationRowFinancialsVisible(callCenter, "phy-1", overrides), false);
  assert.equal(canEditOperationFeesForViewer(callCenter, overrides), true);
});

test("invoice visibility follows linked operation or encounter overrides", () => {
  const hideEnc = {
    ...DEFAULT_MONEY_VISIBILITY_OVERRIDES,
    encounters: FinancialVisibilityOverride.HIDE_VISIBILITY_AND_EDIT,
  };
  const hideOps = {
    ...DEFAULT_MONEY_VISIBILITY_OVERRIDES,
    operations: FinancialVisibilityOverride.HIDE_VISIBILITY_AND_EDIT,
  };
  assert.equal(
    invoiceFinancialsVisible(receptionist, { encounterId: "e1", encounterClinicianId: "phy-1" }, hideEnc),
    false,
  );
  assert.equal(
    invoiceFinancialsVisible(receptionist, { operationId: "o1", operationClinicianId: "phy-1" }, hideOps),
    false,
  );
  assert.equal(
    invoiceFinancialsVisible(receptionist, { encounterId: "e1", encounterClinicianId: "phy-1" }, DEFAULT_MONEY_VISIBILITY_OVERRIDES),
    true,
  );
});

test("encounter invoice hidden when linked appointment money is hidden", () => {
  const overrides = {
    ...DEFAULT_MONEY_VISIBILITY_OVERRIDES,
    appointments: FinancialVisibilityOverride.HIDE_VISIBILITY_AND_EDIT,
  };
  assert.equal(
    invoiceFinancialsVisible(
      receptionist,
      {
        encounterId: "e1",
        encounterClinicianId: "phy-1",
        appointmentClinicianId: "phy-2",
      },
      overrides,
    ),
    false,
  );
});