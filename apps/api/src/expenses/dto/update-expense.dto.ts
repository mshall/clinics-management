import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsDateString, IsIn, IsNumber, IsOptional, IsString, MaxLength, Min } from "class-validator";
import { Type } from "class-transformer";
import { BASE_CURRENCIES } from "../../common/base-currencies";

export class UpdateExpenseDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  clinicId?: string;

  @ApiPropertyOptional({ example: "UTILITIES" })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  category?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  vendorName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount?: number;

  @ApiPropertyOptional({ example: "AED", enum: BASE_CURRENCIES })
  @IsOptional()
  @IsString()
  @IsIn(BASE_CURRENCIES)
  currency?: string;

  @ApiPropertyOptional({ example: "2025-05-01T12:00:00.000Z" })
  @IsOptional()
  @IsDateString()
  incurredAt?: string;
}
