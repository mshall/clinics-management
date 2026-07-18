import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsArray, IsOptional, IsString, MaxLength } from "class-validator";
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
}
