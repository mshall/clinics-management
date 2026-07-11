import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsDateString, IsIn, IsNumber, IsOptional, IsString, MaxLength, Min } from "class-validator";
import { BASE_CURRENCIES } from "../../common/base-currencies";

export class CreateOperationDto {
  @ApiProperty()
  @IsString()
  patientId!: string;

  @ApiProperty()
  @IsString()
  clinicianId!: string;

  @ApiProperty({ description: "Scheduled operation date/time (ISO 8601)" })
  @IsDateString()
  operationDate!: string;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  totalCost!: number;

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
