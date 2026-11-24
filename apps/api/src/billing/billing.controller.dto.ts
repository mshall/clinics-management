import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsArray, IsBoolean, IsIn, IsNumber, IsOptional, IsString } from "class-validator";
import { Lenient } from "../common/lenient-dto";
import type { PlanKey } from "@prisma/client";
import type { BillingInterval } from "@prisma/client";
import type { PaymentMethod } from "@prisma/client";

/** Body of `recordPaywallEvent` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class BillingRecordPaywallEventBodyDto {
  @ApiProperty({ type: String })
  @IsString()
  type!: string;

  @ApiProperty({ type: String })
  @IsString()
  entitlement!: string;

  @ApiProperty({ type: String })
  @IsString()
  requiredPlan!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  source?: string | null;
}

/** Body of `purchaseSpecialtyAddon` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class BillingPurchaseSpecialtyAddonBodyDto {
  @ApiProperty({ type: String })
  @IsString()
  entitlementKey!: string;
}

/** Body of `previewChange` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class BillingPreviewChangeBodyDto {
  @ApiProperty({ enum: ["LITE", "PRO", "CLINIC", "ENTERPRISE", "NURSE_LITE", "NURSE_PRO", "NURSE_AGENCY"] })
  @IsIn(["LITE", "PRO", "CLINIC", "ENTERPRISE", "NURSE_LITE", "NURSE_PRO", "NURSE_AGENCY"])
  planKey!: PlanKey;

  @ApiProperty({ enum: ["MONTHLY", "ANNUAL"] })
  @IsIn(["MONTHLY", "ANNUAL"])
  interval!: BillingInterval;

  @ApiProperty({ type: Number })
  @Type(() => Number)
  @IsNumber()
  seats!: number;

  @ApiPropertyOptional({ enum: ["IMMEDIATE", "PERIOD_END"] })
  @IsOptional()
  @IsIn(["IMMEDIATE", "PERIOD_END"])
  timing?: "IMMEDIATE" | "PERIOD_END";
}

/** Body of `changePlan` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class BillingChangePlanBodyDto {
  @ApiProperty({ enum: ["LITE", "PRO", "CLINIC", "ENTERPRISE", "NURSE_LITE", "NURSE_PRO", "NURSE_AGENCY"] })
  @IsIn(["LITE", "PRO", "CLINIC", "ENTERPRISE", "NURSE_LITE", "NURSE_PRO", "NURSE_AGENCY"])
  planKey!: PlanKey;

  @ApiProperty({ enum: ["MONTHLY", "ANNUAL"] })
  @IsIn(["MONTHLY", "ANNUAL"])
  interval!: BillingInterval;

  @ApiProperty({ type: Number })
  @Type(() => Number)
  @IsNumber()
  seats!: number;

  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @IsBoolean()
  confirm?: boolean;

  @ApiPropertyOptional({ enum: ["IMMEDIATE", "PERIOD_END"] })
  @IsOptional()
  @IsIn(["IMMEDIATE", "PERIOD_END"])
  timing?: "IMMEDIATE" | "PERIOD_END";

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  activeClinicianUserIds?: string[];
}

/** Body of `changeSeats` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class BillingChangeSeatsBodyDto {
  @ApiProperty({ type: Number })
  @Type(() => Number)
  @IsNumber()
  seats!: number;

  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @IsBoolean()
  confirm?: boolean;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  activeClinicianUserIds?: string[];
}

/** Body of `previewSeats` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class BillingPreviewSeatsBodyDto {
  @ApiProperty({ type: Number })
  @Type(() => Number)
  @IsNumber()
  seats!: number;
}

/** Body of `cancelSubscription` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class BillingCancelSubscriptionBodyDto {
  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @IsBoolean()
  atPeriodEnd?: boolean;
}

/** Body of `createCatalog` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class BillingCreateCatalogBodyDto {
  @ApiProperty({ type: String })
  @IsString()
  code!: string;

  @ApiProperty({ type: String })
  @IsString()
  nameEn!: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  nameAr?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiProperty({ type: Number })
  @Type(() => Number)
  @IsNumber()
  amount!: number;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  currency?: string;
}

/** Body of `recordPayment` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class BillingRecordPaymentBodyDto {
  @ApiProperty({ type: String })
  @IsString()
  clinicId!: string;

  @ApiProperty({ type: String })
  @IsString()
  patientId!: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  invoiceId?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiProperty({ type: [Object] })
  @IsArray()
  allocations!: { method: PaymentMethod; amount: number }[];

  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @IsBoolean()
  submitEta?: boolean;
}

/** Body of `cashClose` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class BillingCashCloseBodyDto {
  @ApiProperty({ type: String })
  @IsString()
  clinicId!: string;

  @ApiProperty({ type: String })
  @IsString()
  shiftDate!: string;

  @ApiProperty({ type: Number })
  @Type(() => Number)
  @IsNumber()
  countedCash!: number;

  @ApiProperty({ type: Number })
  @Type(() => Number)
  @IsNumber()
  countedCard!: number;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  notes?: string;
}
