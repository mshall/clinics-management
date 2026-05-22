import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsDateString, IsNumber, IsOptional, IsString, MaxLength, Min } from "class-validator";

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
}
