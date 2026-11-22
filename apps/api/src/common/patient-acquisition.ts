import { BadRequestException } from "@nestjs/common";
import { PatientAcquisitionChannel } from "@prisma/client";

export type PatientAcquisitionInput = {
  acquisitionChannel?: PatientAcquisitionChannel;
  acquisitionReferralName?: string;
  acquisitionOtherDetail?: string;
};

export function requirePatientAcquisition(dto: PatientAcquisitionInput): void {
  if (dto.acquisitionChannel === undefined || dto.acquisitionChannel === null) {
    throw new BadRequestException("How the patient found the clinic is required");
  }
  validatePatientAcquisition(dto);
}

/** Enforce tenant operationAcquisitionRequired setting (optional by default). */
export function assertOperationAcquisition(
  dto: PatientAcquisitionInput,
  required: boolean,
): void {
  if (required) {
    requirePatientAcquisition(dto);
    return;
  }
  if (hasPatientAcquisitionInput(dto)) {
    validatePatientAcquisition(dto);
  }
}

export function validatePatientAcquisition(dto: PatientAcquisitionInput): void {
  if (
    dto.acquisitionChannel === PatientAcquisitionChannel.DOCTOR_REFERRAL ||
    dto.acquisitionChannel === PatientAcquisitionChannel.ANOTHER_PATIENT
  ) {
    if (!dto.acquisitionReferralName?.trim()) {
      throw new BadRequestException(
        dto.acquisitionChannel === PatientAcquisitionChannel.ANOTHER_PATIENT
          ? "Referring patient name is required for another-patient referral"
          : "Referring doctor name is required for doctor referral",
      );
    }
  }
  if (dto.acquisitionChannel === PatientAcquisitionChannel.OTHER) {
    if (!dto.acquisitionOtherDetail?.trim()) {
      throw new BadRequestException("Channel detail is required when acquisition source is Other");
    }
  }
}

export function patientAcquisitionUpdateData(dto: PatientAcquisitionInput) {
  const channel = dto.acquisitionChannel ?? null;
  const needsReferral =
    channel === PatientAcquisitionChannel.DOCTOR_REFERRAL ||
    channel === PatientAcquisitionChannel.ANOTHER_PATIENT;
  return {
    acquisitionChannel: channel,
    acquisitionReferralName: needsReferral ? dto.acquisitionReferralName?.trim() ?? null : null,
    acquisitionOtherDetail:
      channel === PatientAcquisitionChannel.OTHER ? dto.acquisitionOtherDetail?.trim() ?? null : null,
  };
}

export function hasPatientAcquisitionInput(dto: PatientAcquisitionInput): boolean {
  return dto.acquisitionChannel !== undefined && dto.acquisitionChannel !== null;
}
