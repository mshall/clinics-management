import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ONBOARDING_REQUIRED_STEPS,
  isCr01ActivationMet,
  medianMinutesToRequiredSteps,
  SKIPPED_STEP_VALUE,
} from "./onboarding-steps";
import { detectAutoCompletedSteps, type OnboardingSyncInput } from "./onboarding-sync";

const baseClinic = {
  id: "c1",
  logoUrl: null,
  licenseNumber: "SELF-SERVE-PENDING",
  openingTime: "09:00",
  closingTime: "00:00",
  createdAt: new Date("2027-01-01T10:00:00Z"),
  updatedAt: new Date("2027-01-01T10:00:00Z"),
};

const emptySync: OnboardingSyncInput = {
  tenant: { whatsAppRemindersEnabled: false, createdAt: new Date("2027-01-01T10:00:00Z") },
  clinics: [baseClinic],
  appointmentTypeCount: 0,
  appointmentTypeCustomized: false,
  availabilityTemplateUpdated: false,
  staffBeyondOwner: false,
  patientCount: 0,
  appointmentCount: 0,
  checkedInAppointmentCount: 0,
  fiscalDeviceReady: false,
  kiorexProfileReady: false,
  doctorVerificationReady: false,
};

describe("ON-04 onboarding", () => {
  it("CR-01 activation requires first appointment and check-in", () => {
    assert.equal(isCr01ActivationMet({}), false);
    assert.equal(isCr01ActivationMet({ first_appointment: "2027-01-02T10:00:00Z" }), false);
    assert.equal(
      isCr01ActivationMet({
        first_appointment: "2027-01-02T10:00:00Z",
        first_check_in: "2027-01-02T10:05:00Z",
      }),
      true,
    );
    assert.equal(
      isCr01ActivationMet({
        first_appointment: SKIPPED_STEP_VALUE,
        first_check_in: "2027-01-02T10:05:00Z",
      }),
      false,
    );
  });

  it("median pilot path to required steps stays under 30 minutes", () => {
    const tenantCreated = new Date("2027-04-01T10:00:00Z");
    const steps: Record<string, string> = {};
    ONBOARDING_REQUIRED_STEPS.forEach((key, i) => {
      steps[key] = new Date(tenantCreated.getTime() + (i + 1) * 4 * 60_000).toISOString();
    });
    const median = medianMinutesToRequiredSteps(tenantCreated, steps);
    assert.ok(median != null);
    assert.ok(median < 30, `median ${median} should be < 30`);
  });

  it("auto-detect marks check-in when appointments are checked in", () => {
    const detected = detectAutoCompletedSteps({
      ...emptySync,
      appointmentCount: 1,
      checkedInAppointmentCount: 1,
    });
    assert.ok(detected.first_appointment);
    assert.ok(detected.first_check_in);
  });
});