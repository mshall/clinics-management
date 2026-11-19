import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";
import { BASE_CURRENCIES } from "../../common/base-currencies";

export class PatchTenantSettingsDto {
  @ApiPropertyOptional({
    description: "Organization base currency; inherited by clinics unless they use a custom default",
    enum: BASE_CURRENCIES,
  })
  @IsOptional()
  @IsString()
  @IsIn(BASE_CURRENCIES)
  baseCurrency?: string;

  @ApiPropertyOptional({
    description: "Default visit/consultation fee for new encounters (same currency as tenant base)",
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  defaultVisitFee?: number;

  @ApiPropertyOptional({
    description: "Days to retain integration failure logs before automatic deletion (default 30)",
    minimum: 1,
    maximum: 3650,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3650)
  integrationFailureRetentionDays?: number;

  @ApiPropertyOptional({
    description: "Tax registration (TRN) applied to all clinics in the organization",
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  defaultTaxRegistrationNumber?: string;

  @ApiPropertyOptional({
    description: "Clear org TRN override and use the market pack default",
  })
  @IsOptional()
  @IsBoolean()
  defaultTaxRegistrationNumberUseMarketDefault?: boolean;

  @ApiPropertyOptional({
    description: "VAT percent on tax invoices for all clinics",
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  defaultInvoiceVatPercent?: number;

  @ApiPropertyOptional({ description: "Clear org VAT override and use the market pack default" })
  @IsOptional()
  @IsBoolean()
  defaultInvoiceVatPercentUseMarketDefault?: boolean;

  @ApiPropertyOptional({ description: "Clear org visit fee override and use the market pack default" })
  @IsOptional()
  @IsBoolean()
  defaultVisitFeeUseMarketDefault?: boolean;

  @ApiPropertyOptional({ description: "Enable WhatsApp appointment reminders (async outbound queue)" })
  @IsOptional()
  @IsBoolean()
  whatsAppRemindersEnabled?: boolean;

  @ApiPropertyOptional({ description: "Hours before appointment to send WhatsApp reminder", default: 24 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(168)
  appointmentReminderHoursBefore?: number;
}
