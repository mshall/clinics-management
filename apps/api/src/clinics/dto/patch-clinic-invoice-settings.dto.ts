import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsArray, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";
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

  @ApiPropertyOptional({ description: "VAT percent (e.g. 5 for UAE)", default: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  invoiceVatPercent?: number;
}
