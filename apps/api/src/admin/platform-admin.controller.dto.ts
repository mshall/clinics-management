import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { Allow, IsArray, IsBoolean, IsIn, IsNumber, IsObject, IsOptional, IsString } from "class-validator";
import { Lenient } from "../common/lenient-dto";

/** Body of `verifyKiorlyPayment` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class PlatformAdminVerifyKiorlyPaymentBodyDto {
  @ApiProperty({ type: Boolean })
  @IsBoolean()
  approved!: boolean;
}

/** Body of `grantCredits` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class PlatformAdminGrantCreditsBodyDto {
  @ApiProperty({ type: Number })
  @Type(() => Number)
  @IsNumber()
  amount!: number;

  @ApiProperty({ type: String })
  @IsString()
  reason!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  expiresAt?: string | null;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  note?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  secondApproverUserId?: string;
}

/** Body of `runSettlement` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class PlatformAdminRunSettlementBodyDto {
  @ApiProperty({ type: String })
  @IsString()
  period!: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tenantIds?: string[];
}

/** Body of `extendTrial` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class PlatformAdminExtendTrialBodyDto {
  @ApiProperty({ type: Number })
  @Type(() => Number)
  @IsNumber()
  days!: number;

  @ApiProperty({ type: String })
  @IsString()
  reason!: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  trialConfigOverride?: Record<string, unknown>;
}

/** Body of `setPlan` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class PlatformAdminSetPlanBodyDto {
  @ApiProperty({ enum: ["LITE", "PRO", "CLINIC", "ENTERPRISE"] })
  @IsIn(["LITE", "PRO", "CLINIC", "ENTERPRISE"])
  planKey!: "LITE" | "PRO" | "CLINIC" | "ENTERPRISE";

  @ApiProperty({ type: String })
  @IsString()
  reason!: string;

  @ApiPropertyOptional({ enum: ["MONTHLY", "ANNUAL", "YEARLY"] })
  @IsOptional()
  @IsIn(["MONTHLY", "ANNUAL", "YEARLY"])
  interval?: "MONTHLY" | "ANNUAL" | "YEARLY";

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  clinicianSeats?: number;

  @ApiPropertyOptional({ enum: ["ACTIVE", "TRIALING"] })
  @IsOptional()
  @IsIn(["ACTIVE", "TRIALING"])
  status?: "ACTIVE" | "TRIALING";
}

/** Body of `putEntitlementOverride` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class PlatformAdminPutEntitlementOverrideBodyDto {
  @ApiProperty({ type: Object })
  @Allow()
  valueJson!: unknown;

  @ApiProperty({ type: String })
  @IsString()
  reason!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  expiresAt?: string | null;
}

/** Body of `resetSalesDemo` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class PlatformAdminResetSalesDemoBodyDto {
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  tier?: string;
}
