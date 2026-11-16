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
    default: "N/A",
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  defaultTaxRegistrationNumber?: string;

  @ApiPropertyOptional({
    description: "VAT percent on tax invoices for all clinics (default 5)",
    default: 5,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  defaultInvoiceVatPercent?: number;

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

  @ApiPropertyOptional({ description: "Default ETA taxpayer activity code for all clinics" })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  etaDefaultTaxpayerActivityCode?: string;

  @ApiPropertyOptional({ description: "Default ETA GPC item code for visit services" })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  etaDefaultItemCode?: string | null;

  @ApiPropertyOptional({
    description: "Label for e-signature token/seal stored in AWS Secrets Manager (per organization)",
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  etaEsignatureLabel?: string | null;

  @ApiPropertyOptional({
    description:
      "Disable Kiorly-issued ETA e-receipts (org not obliged or uses another ETA-registered system)",
  })
  @IsOptional()
  @IsBoolean()
  etaPhysicalReportingOptOut?: boolean;

  @ApiPropertyOptional({
    description: "ISO timestamp when the organization admin acknowledged physical reporting responsibility",
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  etaPhysicalReportingConsentAt?: string | null;
}
