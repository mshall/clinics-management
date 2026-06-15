import { BadRequestException } from "@nestjs/common";
import { PatientAcquisitionChannel } from "@prisma/client";

export type PatientAcquisitionInput = {
  acquisitionChannel?: PatientAcquisitionChannel;
  acquisitionReferralName?: string;
  acquisitionOtherDetail?: string;
};

export function validatePatientAcquisition(dto: PatientAcquisitionInput): void {
  if (dto.acquisitionChannel === PatientAcquisitionChannel.DOCTOR_REFERRAL) {
    if (!dto.acquisitionReferralName?.trim()) {
      throw new BadRequestException("Referring doctor name is required for doctor referral");
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
  return {
    acquisitionChannel: channel,
    acquisitionReferralName:
      channel === PatientAcquisitionChannel.DOCTOR_REFERRAL ? dto.acquisitionReferralName?.trim() ?? null : null,
    acquisitionOtherDetail:
      channel === PatientAcquisitionChannel.OTHER ? dto.acquisitionOtherDetail?.trim() ?? null : null,
  };
}

export function hasPatientAcquisitionInput(dto: PatientAcquisitionInput): boolean {
  return dto.acquisitionChannel !== undefined && dto.acquisitionChannel !== null;
}
