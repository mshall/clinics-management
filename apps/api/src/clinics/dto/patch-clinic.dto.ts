import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { Allow, IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { BASE_CURRENCIES } from "../../common/base-currencies";

export class PatchClinicDto {
  @ApiPropertyOptional({
    description: "Parent clinic id; set null to make a root-level clinic, or a root clinic id to attach as branch",
    nullable: true,
  })
  @Transform(({ value }) => {
    if (value === null) return null;
    if (value === undefined) return undefined;
    if (typeof value === "string" && !value.trim()) return null;
    return typeof value === "string" ? value.trim() : value;
  })
  @Allow()
  parentClinicId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  nameEn?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  nameAr?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  country?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  city?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  addressEn?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  addressAr?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  locationUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  @MaxLength(200)
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  licenseNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  logoUrl?: string;

  @ApiPropertyOptional({ enum: BASE_CURRENCIES, description: "Default currency for fees at this clinic" })
  @IsOptional()
  @IsString()
  @IsIn(BASE_CURRENCIES)
  defaultCurrency?: string;
}
