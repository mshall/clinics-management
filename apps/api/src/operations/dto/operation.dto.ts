import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class OperationDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  clinicId!: string;

  @ApiPropertyOptional()
  clinicNameEn?: string | null;

  @ApiPropertyOptional()
  clinicNameAr?: string | null;

  @ApiProperty()
  patientId!: string;

  @ApiPropertyOptional()
  patientMrn?: string | null;

  @ApiPropertyOptional()
  patientName?: string | null;

  @ApiProperty()
  clinicianId!: string;

  @ApiPropertyOptional()
  clinicianName?: string | null;

  @ApiPropertyOptional({ nullable: true })
  clinicianFirstNameEn?: string | null;

  @ApiPropertyOptional({ nullable: true })
  clinicianLastNameEn?: string | null;

  @ApiPropertyOptional({ nullable: true })
  clinicianFirstNameAr?: string | null;

  @ApiPropertyOptional({ nullable: true })
  clinicianLastNameAr?: string | null;

  @ApiProperty()
  operationDate!: string;

  @ApiProperty()
  totalCost!: number;

  @ApiProperty()
  downPayment!: number;

  @ApiProperty()
  paidAmount!: number;

  @ApiProperty()
  balanceDue!: number;

  @ApiProperty({ description: "Currency amounts are recorded in (may differ from clinic default)" })
  feeCurrency!: string;

  @ApiPropertyOptional()
  comments!: string | null;

  @ApiProperty({ enum: ["SCHEDULED", "CANCELLED", "COMPLETED"] })
  status!: string;

  @ApiProperty()
  createdAt!: string;
}
