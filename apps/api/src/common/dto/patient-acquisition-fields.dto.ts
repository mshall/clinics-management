import { ApiPropertyOptional } from "@nestjs/swagger";
import { PatientAcquisitionChannel } from "@prisma/client";
import { IsEnum, IsOptional, IsString, MaxLength, ValidateIf } from "class-validator";

/** Optional patient acquisition fields (shared by patient & encounter create). */
export class PatientAcquisitionFieldsDto {
  @ApiPropertyOptional({ enum: PatientAcquisitionChannel, description: "How the patient found the clinic" })
  @IsOptional()
  @IsEnum(PatientAcquisitionChannel)
  acquisitionChannel?: PatientAcquisitionChannel;

  @ApiPropertyOptional({
    description: "Referring doctor or patient name when acquisitionChannel is DOCTOR_REFERRAL or ANOTHER_PATIENT",
  })
  @ValidateIf(
    (o) =>
      o.acquisitionChannel === PatientAcquisitionChannel.DOCTOR_REFERRAL ||
      o.acquisitionChannel === PatientAcquisitionChannel.ANOTHER_PATIENT,
  )
  @IsOptional()
  @IsString()
  @MaxLength(200)
  acquisitionReferralName?: string;

  @ApiPropertyOptional({ description: "Free-text channel when acquisitionChannel is OTHER" })
  @ValidateIf((o) => o.acquisitionChannel === PatientAcquisitionChannel.OTHER)
  @IsOptional()
  @IsString()
  @MaxLength(500)
  acquisitionOtherDetail?: string;
}
