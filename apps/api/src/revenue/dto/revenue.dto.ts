import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class RevenueEntryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  clinicId!: string;

  @ApiPropertyOptional({ nullable: true, description: "Clinic display name (English)" })
  clinicNameEn!: string | null;

  @ApiPropertyOptional({ nullable: true, description: "Clinic display name (Arabic)" })
  clinicNameAr!: string | null;

  @ApiProperty()
  category!: string;

  @ApiPropertyOptional({ nullable: true })
  description!: string | null;

  @ApiProperty()
  grossAmount!: number;

  @ApiProperty()
  taxAmount!: number;

  @ApiProperty()
  netAmount!: number;

  @ApiProperty()
  currency!: string;

  @ApiProperty()
  postedAt!: string;

  @ApiProperty()
  status!: string;

  @ApiPropertyOptional({ nullable: true, description: "B2B counterparty legal name when e-receipt was skipped" })
  counterpartyName?: string | null;

  @ApiPropertyOptional({ nullable: true, description: "B2B counterparty tax registration when e-receipt was skipped" })
  counterpartyTaxNumber?: string | null;
}
