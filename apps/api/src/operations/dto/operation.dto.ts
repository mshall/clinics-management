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

  @ApiPropertyOptional()
  comments!: string | null;

  @ApiProperty({ enum: ["SCHEDULED", "CANCELLED", "COMPLETED"] })
  status!: string;

  @ApiProperty()
  createdAt!: string;
}
