import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { Allow, IsBoolean, IsIn, IsNumber, IsOptional, IsString } from "class-validator";
import { Lenient } from "../common/lenient-dto";

/** Body of `resumePlan` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class NurseClinicalResumePlanBodyDto {
  @ApiProperty({ type: String })
  @IsString()
  startDate!: string;

  @ApiProperty({ type: Object })
  @Allow()
  visitAddress!: unknown;
}

/** Body of `extendPlan` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class NurseClinicalExtendPlanBodyDto {
  @ApiProperty({ type: String })
  @IsString()
  startDate!: string;

  @ApiProperty({ type: Number })
  @Type(() => Number)
  @IsNumber()
  extraDays!: number;

  @ApiProperty({ type: Object })
  @Allow()
  visitAddress!: unknown;
}

/** Body of `endPlan` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class NurseClinicalEndPlanBodyDto {
  @ApiProperty({ enum: ["COMPLETED", "CANCELLED_BY_PATIENT", "CANCELLED_BY_PROVIDER", "EXPIRED"] })
  @IsIn(["COMPLETED", "CANCELLED_BY_PATIENT", "CANCELLED_BY_PROVIDER", "EXPIRED"])
  reason!: "COMPLETED" | "CANCELLED_BY_PATIENT" | "CANCELLED_BY_PROVIDER" | "EXPIRED";

  @ApiProperty({ type: String })
  @IsString()
  dischargeNote!: string;
}

/** Body of `declinePlanRequest` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class NurseClinicalDeclinePlanRequestBodyDto {
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  reason?: string;
}

/** Body of `escalation` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class NurseClinicalEscalationBodyDto {
  @ApiProperty({ type: String })
  @IsString()
  action!: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  note?: string;
}

/** Body of `bookShift` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class NurseClinicalBookShiftBodyDto {
  @ApiProperty({ type: String })
  @IsString()
  patientId!: string;

  @ApiProperty({ type: String })
  @IsString()
  nurseId!: string;

  @ApiProperty({ type: String })
  @IsString()
  startsAt!: string;

  @ApiProperty({ type: Number })
  @Type(() => Number)
  @IsNumber()
  durationHours!: number;
}

/** Body of `checkIn` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class NurseClinicalCheckInBodyDto {
  @ApiProperty({ type: Number })
  @Type(() => Number)
  @IsNumber()
  lat!: number;

  @ApiProperty({ type: Number })
  @Type(() => Number)
  @IsNumber()
  lng!: number;
}

/** Body of `checkOut` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class NurseClinicalCheckOutBodyDto {
  @ApiProperty({ type: Number })
  @Type(() => Number)
  @IsNumber()
  lat!: number;

  @ApiProperty({ type: Number })
  @Type(() => Number)
  @IsNumber()
  lng!: number;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  handoverNote?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  handoverToNurseId?: string;
}

/** Body of `setFamilyConsent` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class NurseClinicalSetFamilyConsentBodyDto {
  @ApiProperty({ type: Boolean })
  @IsBoolean()
  granted!: boolean;
}
