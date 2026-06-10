import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import { IsIn, IsNumber, IsOptional, IsString, MaxLength, Min, MinLength } from "class-validator";
import { BASE_CURRENCIES } from "../../common/base-currencies";

function trimOptionalString(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
}

export class PlatformPatchTenantDto {
  @ApiPropertyOptional({ description: "Organization name (English)" })
  @Transform(({ value }) => trimOptionalString(value))
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ description: "Organization name (Arabic)" })
  @Transform(({ value }) => trimOptionalString(value))
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
