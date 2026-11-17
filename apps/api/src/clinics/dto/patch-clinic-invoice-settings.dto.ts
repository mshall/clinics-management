import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsArray, IsBoolean, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";
import { INVOICE_SECTION_KEYS } from "../../common/invoice-config";

export class PatchClinicInvoiceSettingsDto {
  @ApiPropertyOptional({ description: "One of the preset invoice background color ids" })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  invoiceBackgroundColor?: string;

  @ApiPropertyOptional({
    type: [String],
    enum: INVOICE_SECTION_KEYS,
    description: "Sections to include on generated invoices",
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  invoiceSections?: string[];

  @ApiPropertyOptional({ description: "UAE TRN or other tax registration number on invoices" })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  taxRegistrationNumber?: string | null;

  @ApiPropertyOptional({ description: "VAT percent on medical service invoices" })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  invoiceVatPercent?: number;

  @ApiPropertyOptional({ description: "Clear clinic VAT override and use organization/market default" })
  @IsOptional()
  @IsBoolean()
  invoiceVatPercentUseMarketDefault?: boolean;
}
