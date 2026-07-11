import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { Allow, IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { BASE_CURRENCIES } from "../../common/base-currencies";

export class CreateClinicDto {
  /**
   * Intentionally not validated with @IsString / @IsUUID: clinic ids are Prisma `cuid()` strings.
   * `@Allow()` keeps whitelist enabled while skipping class-validator constraints on this field.
   * Length and existence checks run in `ClinicsService.create`.
   */
  @ApiPropertyOptional({ description: "Parent clinic id; omit for a top-level (parent) clinic (Prisma cuid)" })
  @Transform(({ value }) => {
    if (value === null || value === undefined) return undefined;
    if (typeof value === "string" && !value.trim()) return undefined;
    return typeof value === "string" ? value.trim() : value;
  })
  @Allow()
  parentClinicId?: string | null;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  nameEn!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  nameAr!: string;

  @ApiPropertyOptional({ default: "AE" })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  country?: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  city!: string;

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

  @ApiPropertyOptional({ description: "Public URL for clinic logo image" })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  logoUrl?: string;

  @ApiPropertyOptional({ default: "AED", enum: BASE_CURRENCIES, description: "Default currency for fees at this clinic" })
  @IsOptional()
  @IsString()
  @IsIn(BASE_CURRENCIES)
  defaultCurrency?: string;
}
