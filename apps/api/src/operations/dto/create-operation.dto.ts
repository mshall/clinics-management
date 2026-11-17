import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { PatientAcquisitionChannel } from "@prisma/client";
import { IsBoolean, IsDateString, IsEnum, IsIn, IsNumber, IsOptional, IsString, MaxLength, Min } from "class-validator";
import { PatientAcquisitionFieldsDto } from "../../common/dto/patient-acquisition-fields.dto";
import { BASE_CURRENCIES } from "../../common/base-currencies";

export class CreateOperationDto extends PatientAcquisitionFieldsDto {
  @ApiProperty({
    enum: PatientAcquisitionChannel,
    description: "How the patient found the clinic (updates the patient profile)",
  })
  @IsEnum(PatientAcquisitionChannel)
  declare acquisitionChannel: PatientAcquisitionChannel;
  @ApiProperty()
  @IsString()
  patientId!: string;

  @ApiProperty()
  @IsString()
  clinicianId!: string;

  @ApiProperty({ description: "Scheduled operation date/time (ISO 8601)" })
  @IsDateString()
  operationDate!: string;

  @ApiPropertyOptional({
    default: 0,
    description: "Optional at booking; required before discharge",
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  totalCost?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  downPayment?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  comments?: string;

  @ApiPropertyOptional({ description: "Defaults to patient home branch or first tenant clinic" })
  @IsOptional()
  @IsString()
  clinicId?: string;

  @ApiPropertyOptional({ description: "When true, no medications or prescriptions apply to this operation" })
  @IsOptional()
  @IsBoolean()
  noMedications?: boolean;

  @ApiPropertyOptional({
    enum: BASE_CURRENCIES,
    description: "Currency the patient pays in; defaults to the clinic default currency",
  })
  @IsOptional()
  @IsString()
  @IsIn(BASE_CURRENCIES)
  feeCurrency?: string;
}
