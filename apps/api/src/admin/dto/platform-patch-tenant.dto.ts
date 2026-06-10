import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsIn, IsNumber, IsOptional, IsString, MaxLength, Min, MinLength } from "class-validator";
import { BASE_CURRENCIES } from "../../common/base-currencies";

export class PlatformPatchTenantDto {
  @ApiPropertyOptional({ description: "Organization name (English)" })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ description: "Organization name (Arabic)" })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  nameAr?: string;

  @ApiPropertyOptional({ example: "AED", enum: BASE_CURRENCIES })
  @IsOptional()
  @IsString()
  @IsIn(BASE_CURRENCIES)
  baseCurrency?: string;

  @ApiPropertyOptional({ example: "en" })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  defaultLocale?: string;

  @ApiPropertyOptional({ description: "Default visit fee for new encounters in this organization" })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  defaultVisitFee?: number;
}
