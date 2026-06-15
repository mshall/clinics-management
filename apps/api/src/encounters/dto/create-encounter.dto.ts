import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsNumber, IsOptional, IsString, MaxLength, Min, MinLength } from "class-validator";
import { PatientAcquisitionFieldsDto } from "../../common/dto/patient-acquisition-fields.dto";

export class CreateEncounterDto extends PatientAcquisitionFieldsDto {
  @ApiProperty()
  @IsString()
  clinicId!: string;

  @ApiProperty()
  @IsString()
  patientId!: string;

  @ApiPropertyOptional({
    description: "Attending physician (user id). Required for non-physician callers; ignored when caller is a physician (self).",
  })
  @IsOptional()
  @IsString()
  clinicianId?: string;

  @ApiProperty({ example: "Follow-up" })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  visitType!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  chiefComplaint?: string;

  @ApiPropertyOptional({
    description: "Consultation / visit fee for this encounter; defaults to tenant defaultVisitFee",
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  visitFeeAmount?: number;

  @ApiPropertyOptional({
    description: "Optional booked appointment for this patient; visit moves to in progress until encounter is finalized",
  })
  @IsOptional()
  @IsString()
  appointmentId?: string;
}
