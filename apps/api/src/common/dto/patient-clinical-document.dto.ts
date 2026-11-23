import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class PatientClinicalDocumentItemDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: ["patient", "encounter", "nationalId"] })
  source!: "patient" | "encounter" | "nationalId";

  @ApiPropertyOptional()
  encounterId?: string;

  @ApiPropertyOptional({ description: "Visit type when source is encounter" })
  encounterVisitType?: string;

  @ApiPropertyOptional()
  description?: string;

  @ApiProperty()
  originalFileName!: string;

  @ApiProperty()
  mimeType!: string;

  @ApiProperty()
  sizeBytes!: number;

  @ApiProperty()
  createdAt!: string;

  @ApiPropertyOptional({ description: "ORIGINAL_KEPT | LOSSLESS | REDUCED | FLOOR_REACHED" })
  qualityNote?: string | null;

  @ApiPropertyOptional()
  originalSizeBytes?: number | null;

  @ApiPropertyOptional()
  qualityUsed?: number | null;

  @ApiPropertyOptional()
  originalAvailable?: boolean;
}

export class PatientClinicalDocumentsDto {
  @ApiProperty({ type: [PatientClinicalDocumentItemDto] })
  labs!: PatientClinicalDocumentItemDto[];

  @ApiProperty({ type: [PatientClinicalDocumentItemDto] })
  radiology!: PatientClinicalDocumentItemDto[];

  @ApiProperty({ type: [PatientClinicalDocumentItemDto] })
  prescriptions!: PatientClinicalDocumentItemDto[];

  @ApiProperty({ type: [PatientClinicalDocumentItemDto] })
  other!: PatientClinicalDocumentItemDto[];
}
