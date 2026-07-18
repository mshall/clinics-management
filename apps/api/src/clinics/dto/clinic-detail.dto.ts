import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { INVOICE_SECTION_KEYS } from "../../common/invoice-config";
import { ClinicOperatingPeriodDto } from "./clinic-operating-period.dto";

export class ClinicDetailDto {
  @ApiProperty()
  id!: string;

  @ApiPropertyOptional({ nullable: true })
  parentClinicId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  parentNameEn!: string | null;

  @ApiPropertyOptional({ nullable: true })
  parentNameAr!: string | null;

  @ApiProperty()
  nameEn!: string;

  @ApiProperty()
  nameAr!: string;

  @ApiProperty()
  city!: string;

  @ApiProperty()
  country!: string;

  @ApiProperty({ enum: ["parent", "branch", "standalone"] })
  kind!: "parent" | "branch" | "standalone";

  @ApiPropertyOptional({ nullable: true })
  logoUrl!: string | null;

  @ApiProperty()
  addressEn!: string;

  @ApiProperty()
  addressAr!: string;

  @ApiProperty()
  locationUrl!: string;

  @ApiProperty()
  phone!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty()
  licenseNumber!: string;

  @ApiProperty()
  defaultLanguage!: string;

  @ApiProperty({ description: "Default currency for appointments, encounters, and operations at this clinic" })
  defaultCurrency!: string;

  @ApiProperty({ description: "Preset id for invoice background color" })
  invoiceBackgroundColor!: string;

  @ApiProperty({ description: "Hex color for invoice background preview" })
  invoiceBackgroundHex!: string;

  @ApiProperty({ type: [String], enum: INVOICE_SECTION_KEYS })
  invoiceSections!: string[];

  @ApiProperty({ description: "Whether an invoice logo has been uploaded" })
  hasInvoiceLogo!: boolean;

  @ApiProperty({ description: "Whether a prescription header logo has been uploaded" })
  hasPrescriptionLogo!: boolean;

  @ApiProperty({ description: "Optional header description on generated prescriptions (English)" })
  prescriptionHeaderDescriptionEn!: string;

  @ApiProperty({ description: "Optional header description on generated prescriptions (Arabic)" })
  prescriptionHeaderDescriptionAr!: string;

  @ApiProperty({ enum: ["ACTIVE", "INACTIVE"] })
  recordStatus!: "ACTIVE" | "INACTIVE";

  @ApiPropertyOptional({ nullable: true, type: String })
  disabledAt!: string | null;

  @ApiProperty({ description: "When the clinic record was created (ISO timestamp)" })
  createdAt!: string;

  @ApiProperty({ type: [ClinicOperatingPeriodDto] })
  operatingPeriods!: ClinicOperatingPeriodDto[];
}
