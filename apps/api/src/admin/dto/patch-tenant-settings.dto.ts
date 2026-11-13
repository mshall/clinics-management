import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";
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
}
