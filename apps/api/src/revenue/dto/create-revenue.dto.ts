import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { RevenueStatus } from "@prisma/client";
import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, MaxLength, Min } from "class-validator";
import { Type } from "class-transformer";

export class CreateRevenueDto {
  @ApiProperty()
  @IsString()
  clinicId!: string;

  @ApiProperty({ example: "VISIT" })
  @IsString()
  @MaxLength(64)
  category!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  grossAmount!: number;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  taxAmount!: number;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  netAmount!: number;

  @ApiProperty({ example: "AED" })
  @IsString()
  @MaxLength(8)
  currency!: string;

  @ApiProperty()
  @IsDateString()
  postedAt!: string;

  @ApiPropertyOptional({ enum: RevenueStatus })
  @IsOptional()
  @IsEnum(RevenueStatus)
  status?: RevenueStatus;

  @ApiPropertyOptional({ description: "When set, records a payment against this operation and updates paid amount" })
  @IsOptional()
  @IsString()
  operationId?: string;

  @ApiPropertyOptional({
    description: "Skip ETA e-receipt queue for non-patient B2B revenue (e-invoice later); requires reason",
  })
  @IsOptional()
  skipEtaEReceipt?: boolean;

  @ApiPropertyOptional({ description: "Required when skipEtaEReceipt is true" })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  skipEtaEReceiptReason?: string;

  @ApiPropertyOptional({ description: "B2B counterparty legal name (required with skipEtaEReceipt)" })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  counterpartyName?: string;

  @ApiPropertyOptional({ description: "B2B counterparty tax registration (required with skipEtaEReceipt)" })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  counterpartyTaxNumber?: string;
}
