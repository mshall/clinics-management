import assert from "node:assert/strict";
import { test } from "node:test";
import { BadRequestException } from "@nestjs/common";
import { PatientAcquisitionChannel } from "@prisma/client";
import { requirePatientAcquisition, validatePatientAcquisition } from "./patient-acquisition";

test("requirePatientAcquisition rejects missing channel", () => {
  assert.throws(() => requirePatientAcquisition({}), BadRequestException);
});

test("requirePatientAcquisition accepts channel with referral detail", () => {
  requirePatientAcquisition({
    acquisitionChannel: PatientAcquisitionChannel.DOCTOR_REFERRAL,
    acquisitionReferralName: "Dr. Ahmed",
  });
  validatePatientAcquisition({
    acquisitionChannel: PatientAcquisitionChannel.SOCIAL_FACEBOOK,
  });
});