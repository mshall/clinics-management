import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsIn, IsNumber, IsOptional, IsString } from "class-validator";
import { Lenient } from "../common/lenient-dto";
import type { ClinicalSpecialty } from "@prisma/client";
import type { FeeType } from "@prisma/client";

/** Body of `create` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class PlatformKiorexRatesCreateBodyDto {
  @ApiProperty({ type: String })
  @IsString()
  marketId!: string;

  @ApiPropertyOptional({ enum: ["POLYCLINIC", "GENERAL_MEDICINE", "PAIN_MANAGEMENT", "ORTHOPEDICS", "PEDIATRICS", "DERMATOLOGY", "DENTISTRY", "PHYSIO_THERAPY", "AESTHETICS", "CARDIOLOGY", "OBSTETRICS_GYNECOLOGY", "ENT", "OPHTHALMOLOGY", "PSYCHIATRY", "RADIOLOGY", "LABORATORY", "INTERNAL_MEDICINE", "FAMILY_MEDICINE", "UROLOGY", "CUSTOM"], nullable: true })
  @IsOptional()
  @IsIn(["POLYCLINIC", "GENERAL_MEDICINE", "PAIN_MANAGEMENT", "ORTHOPEDICS", "PEDIATRICS", "DERMATOLOGY", "DENTISTRY", "PHYSIO_THERAPY", "AESTHETICS", "CARDIOLOGY", "OBSTETRICS_GYNECOLOGY", "ENT", "OPHTHALMOLOGY", "PSYCHIATRY", "RADIOLOGY", "LABORATORY", "INTERNAL_MEDICINE", "FAMILY_MEDICINE", "UROLOGY", "CUSTOM"])
  specialty?: ClinicalSpecialty | null;

  @ApiProperty({ enum: ["FLAT", "PERCENT"] })
  @IsIn(["FLAT", "PERCENT"])
  feeType!: FeeType;

  @ApiPropertyOptional({ type: Number, nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  amount?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  percent?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  minAmount?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  maxAmount?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  benchmarkFlat?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  benchmarkPercent?: number | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  benchmarkSource?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  benchmarkCheckedAt?: string | null;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  validFrom?: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  validTo?: string | null;
}

/** Body of `patchMarketSettings` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class PlatformKiorexRatesPatchMarketSettingsBodyDto {
  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  benchmarkTargetRatio?: number;

  @ApiPropertyOptional({ type: Number, nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  liteMonthlyCap?: number | null;
}
