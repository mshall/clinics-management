import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { Allow, IsBoolean, IsIn, IsNumber, IsOptional, IsString } from "class-validator";
import { Lenient } from "../common/lenient-dto";
import type { PlanKey } from "@prisma/client";
import type { BillingInterval } from "@prisma/client";
import type { PriceUnit } from "@prisma/client";

/** Body of `create` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class PlatformPlansCreateBodyDto {
  @ApiProperty({ enum: ["LITE", "PRO", "CLINIC", "ENTERPRISE", "NURSE_LITE", "NURSE_PRO", "NURSE_AGENCY"] })
  @IsIn(["LITE", "PRO", "CLINIC", "ENTERPRISE", "NURSE_LITE", "NURSE_PRO", "NURSE_AGENCY"])
  key!: PlanKey;

  @ApiProperty({ type: String })
  @IsString()
  nameEn!: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  nameAr?: string;

  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  sortOrder?: number;
}

/** Body of `createPrice` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class PlatformPlansCreatePriceBodyDto {
  @ApiProperty({ type: String })
  @IsString()
  marketId!: string;

  @ApiProperty({ type: String })
  @IsString()
  currency!: string;

  @ApiProperty({ enum: ["MONTHLY", "ANNUAL"] })
  @IsIn(["MONTHLY", "ANNUAL"])
  interval!: BillingInterval;

  @ApiProperty({ enum: ["PER_TENANT", "PER_CLINICIAN"] })
  @IsIn(["PER_TENANT", "PER_CLINICIAN"])
  unit!: PriceUnit;

  @ApiProperty({ type: Object })
  @Allow()
  amount!: number | string;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  includedClinicians?: number;

  @ApiPropertyOptional({ type: Object, nullable: true })
  @IsOptional()
  @Allow()
  extraClinicianAmount?: number | string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  cohortKey?: string | null;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  validFrom?: string;

  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @IsBoolean()
  newVersion?: boolean;

  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @IsBoolean()
  preview?: boolean;
}
