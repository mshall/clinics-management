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
}
