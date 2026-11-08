import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsDateString, IsIn, IsNumber, IsOptional, IsString, MaxLength, Min, ValidateIf } from "class-validator";
import { BASE_CURRENCIES } from "../../common/base-currencies";

export class IntegrationBookOperationDto {
  @ApiProperty()
  @IsString()
  clinicId!: string;

  @ApiPropertyOptional()
  @ValidateIf((o: IntegrationBookOperationDto) => !o.patientMrn)
  @IsString()
  patientId?: string;

  @ApiPropertyOptional()
  @ValidateIf((o: IntegrationBookOperationDto) => !o.patientId)
  @IsString()
  patientMrn?: string;

  @ApiProperty()
  @IsString()
  clinicianId!: string;

  @ApiProperty()
  @IsDateString()
  operationDate!: string;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  totalCost!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  downPayment?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  comments?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  externalReference?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  noMedications?: boolean;

  @ApiPropertyOptional({ enum: BASE_CURRENCIES })
  @IsOptional()
  @IsString()
  @IsIn(BASE_CURRENCIES)
  feeCurrency?: string;
}
