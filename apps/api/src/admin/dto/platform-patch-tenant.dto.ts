import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsNumber, IsOptional, IsString, MaxLength, Min, MinLength } from "class-validator";

export class PlatformPatchTenantDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ example: "AED" })
  @IsOptional()
  @IsString()
  @MaxLength(8)
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
