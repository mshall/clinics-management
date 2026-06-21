import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class PatientClinicalDocumentItemDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: ["patient", "encounter"] })
  source!: "patient" | "encounter";

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
