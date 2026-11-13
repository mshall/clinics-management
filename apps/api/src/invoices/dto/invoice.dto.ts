import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class InvoiceLineDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  purpose!: string;

  @ApiProperty()
  amountPaid!: number;

  @ApiProperty()
  sortOrder!: number;
}

export class InvoiceDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  clinicId!: string;

  @ApiProperty()
  patientId!: string;

  @ApiPropertyOptional({ nullable: true })
  encounterId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  operationId!: string | null;

  @ApiProperty()
  invoiceNumber!: string;

  @ApiProperty()
  issueDate!: string;

  @ApiProperty()
  currency!: string;

  @ApiProperty()
  backgroundColor!: string;

  @ApiProperty({ type: [String] })
  sections!: string[];

  @ApiProperty()
  patientName!: string;

  @ApiPropertyOptional({ nullable: true })
  patientMrn!: string | null;

  @ApiProperty()
  clinicNameEn!: string;

  @ApiProperty()
  clinicNameAr!: string;

  @ApiProperty()
  clinicAddressEn!: string;

  @ApiProperty()
  clinicAddressAr!: string;

  @ApiProperty()
  clinicPhone!: string;

  @ApiProperty()
  clinicEmail!: string;

  @ApiProperty()
  clinicLicenseNumber!: string;

  @ApiPropertyOptional({ nullable: true, description: "Tax registration number (TRN) at time of issue" })
  clinicTaxRegistrationNumber!: string | null;

  @ApiProperty({ description: "VAT percent snapshot at issue time" })
  vatPercent!: number;

  @ApiProperty({ description: "Taxable amount excluding VAT" })
  subtotalExVat!: number;

  @ApiProperty({ description: "VAT amount" })
  vatAmount!: number;

  @ApiProperty()
  totalAmount!: number;

  @ApiProperty({ type: [InvoiceLineDto] })
  lines!: InvoiceLineDto[];

  @ApiProperty()
  createdAt!: string;
}

export class InvoiceListItemDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  invoiceNumber!: string;

  @ApiProperty()
  issueDate!: string;

  @ApiProperty()
  currency!: string;

  @ApiProperty()
  totalAmount!: number;

  @ApiPropertyOptional({ nullable: true })
  encounterId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  operationId!: string | null;

  @ApiProperty()
  createdAt!: string;
}
