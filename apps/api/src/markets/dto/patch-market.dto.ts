import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { BASE_CURRENCIES } from "../../common/base-currencies";

export class PatchMarketDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  nameEn?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  nameAr?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  dataRegion?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  hostCell?: string;

  @ApiPropertyOptional({ enum: BASE_CURRENCIES })
  @IsOptional()
  @IsString()
  @IsIn(BASE_CURRENCIES)
  defaultCurrency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  defaultTimezone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(8)
  defaultPhoneRegion?: string;
}

export class PauseMarketDto {
  @ApiPropertyOptional({ description: "Pause length in days (1–365)", default: 7 })
  @IsOptional()
  days?: number;
}