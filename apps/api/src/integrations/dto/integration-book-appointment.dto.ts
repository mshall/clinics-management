import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsDateString, IsOptional, IsString, MaxLength, ValidateIf } from "class-validator";

export class IntegrationBookAppointmentDto {
  @ApiProperty({ description: "Clinic branch where the visit is booked" })
  @IsString()
  clinicId!: string;

  @ApiPropertyOptional({ description: "Internal patient id when already synced" })
  @ValidateIf((o: IntegrationBookAppointmentDto) => !o.patientMrn)
  @IsString()
  patientId?: string;

  @ApiPropertyOptional({ description: "Patient MRN in the clinic system (alternative to patientId)" })
  @ValidateIf((o: IntegrationBookAppointmentDto) => !o.patientId)
  @IsString()
  patientMrn?: string;

  @ApiProperty({ description: "Attending physician user id" })
  @IsString()
  clinicianId!: string;

  @ApiProperty()
  @IsDateString()
  startsAt!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @ApiPropertyOptional({
    description: "Idempotency key from the external patient platform (unique per integration client)",
  })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  externalReference?: string;

  @ApiPropertyOptional({ description: "Set true to allow double-booking the same clinician" })
  @IsOptional()
  @IsBoolean()
  confirmOverlap?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
