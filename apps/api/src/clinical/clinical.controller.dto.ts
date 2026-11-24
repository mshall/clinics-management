import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { Allow, IsArray, IsIn, IsNumber, IsObject, IsOptional, IsString } from "class-validator";
import { Lenient } from "../common/lenient-dto";
import type { ClinicalShortcutType } from "@prisma/client";
import type { ClinicalLetterType } from "@prisma/client";
import type { ClinicalOrderKind } from "@prisma/client";
import type { ClinicalOrderStatus } from "@prisma/client";

/** Body of `createShortcut` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class ClinicalCreateShortcutBodyDto {
  @ApiProperty({ enum: ["TEXT_EXPAND", "DIAGNOSIS_FAV", "RX_SET", "COPY_LAST_VISIT"] })
  @IsIn(["TEXT_EXPAND", "DIAGNOSIS_FAV", "RX_SET", "COPY_LAST_VISIT"])
  type!: ClinicalShortcutType;

  @ApiProperty({ type: String })
  @IsString()
  label!: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  trigger?: string;

  @ApiProperty({ type: Object })
  @Allow()
  payload!: unknown;
}

/** Body of `favIcd` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class ClinicalFavIcdBodyDto {
  @ApiProperty({ type: String })
  @IsString()
  icd10Code!: string;
}

/** Body of `letter` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class ClinicalLetterBodyDto {
  @ApiProperty({ enum: ["SICK_LEAVE", "MEDICAL_REPORT", "REFERRAL", "FITNESS_CERTIFICATE"] })
  @IsIn(["SICK_LEAVE", "MEDICAL_REPORT", "REFERRAL", "FITNESS_CERTIFICATE"])
  type!: ClinicalLetterType;

  @ApiProperty({ type: String })
  @IsString()
  patientId!: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  encounterId?: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  fields?: Record<string, string>;
}

/** Body of `rxCheck` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class ClinicalRxCheckBodyDto {
  @ApiProperty({ type: String })
  @IsString()
  patientId!: string;

  @ApiProperty({ type: [Object] })
  @IsArray()
  items!: { drugName: string; drugProductId?: string | null }[];
}

/** Body of `safetyCheck` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class ClinicalSafetyCheckBodyDto {
  @ApiProperty({ type: String })
  @IsString()
  patientId!: string;

  @ApiProperty({ type: String })
  @IsString()
  drugName!: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  drugProductId?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  existingDrugNames?: string[];
}

/** Body of `createOrder` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class ClinicalCreateOrderBodyDto {
  @ApiProperty({ type: String })
  @IsString()
  clinicId!: string;

  @ApiProperty({ type: String })
  @IsString()
  patientId!: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  encounterId?: string;

  @ApiProperty({ enum: ["LAB", "IMAGING"] })
  @IsIn(["LAB", "IMAGING"])
  kind!: ClinicalOrderKind;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ type: [Object] })
  @IsArray()
  items!: { code?: string; nameEn: string; nameAr?: string }[];
}

/** Body of `patchOrder` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class ClinicalPatchOrderBodyDto {
  @ApiPropertyOptional({ enum: ["DRAFT", "ORDERED", "IN_PROGRESS", "RESULTS_READY", "CANCELLED"] })
  @IsOptional()
  @IsIn(["DRAFT", "ORDERED", "IN_PROGRESS", "RESULTS_READY", "CANCELLED"])
  status?: ClinicalOrderStatus;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @Allow()
  resultsJson?: unknown;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ type: [Object] })
  @IsOptional()
  @IsArray()
  items?: { id?: string; resultValue?: string; resultUnit?: string; resultFlag?: string }[];
}

/** Body of `upsertDentalTooth` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class ClinicalUpsertDentalToothBodyDto {
  @ApiProperty({ type: Number })
  @Type(() => Number)
  @IsNumber()
  toothFdi!: number;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  planNote?: string;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  feeAmount?: number;
}

/** Body of `physioPlan` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class ClinicalPhysioPlanBodyDto {
  @ApiProperty({ type: String })
  @IsString()
  clinicId!: string;

  @ApiProperty({ type: String })
  @IsString()
  patientId!: string;

  @ApiProperty({ type: String })
  @IsString()
  clinicianId!: string;

  @ApiProperty({ type: String })
  @IsString()
  label!: string;

  @ApiProperty({ type: Number })
  @Type(() => Number)
  @IsNumber()
  sessionCount!: number;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  notes?: string;
}
