import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class DiagnosisDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  icd10Code!: string;

  @ApiProperty()
  descriptionEn!: string;

  @ApiPropertyOptional({ nullable: true })
  descriptionAr!: string | null;

  @ApiProperty()
  isPrimary!: boolean;
}

export class EncounterMedicationDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  drugName!: string;

  @ApiPropertyOptional({ nullable: true })
  dosage!: string | null;

  @ApiPropertyOptional({ nullable: true })
  route!: string | null;

  @ApiPropertyOptional({ nullable: true })
  frequency!: string | null;

  @ApiPropertyOptional({ nullable: true })
  duration!: string | null;

  @ApiPropertyOptional({ nullable: true })
  instructions!: string | null;
}

export class EncounterDocumentDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: ["LAB", "RADIOLOGY"] })
  kind!: string;

  @ApiProperty()
  originalFileName!: string;

  @ApiProperty()
  mimeType!: string;

  @ApiProperty()
  sizeBytes!: number;

  @ApiProperty()
  createdAt!: string;
}

export class EncounterDetailDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  clinicId!: string;

  @ApiPropertyOptional({ nullable: true, description: "Clinic display name (English)" })
  clinicNameEn!: string | null;

  @ApiPropertyOptional({ nullable: true, description: "Clinic display name (Arabic)" })
  clinicNameAr!: string | null;

  @ApiProperty()
  patientId!: string;

  @ApiProperty()
  clinicianId!: string;

  @ApiProperty()
  status!: string;

  @ApiProperty()
  visitType!: string;

  @ApiPropertyOptional({ nullable: true })
  chiefComplaint!: string | null;

  @ApiPropertyOptional({ nullable: true })
  subjective!: string | null;

  @ApiPropertyOptional({ nullable: true })
  objective!: string | null;

  @ApiPropertyOptional({ nullable: true })
  assessment!: string | null;

  @ApiPropertyOptional({ nullable: true })
  plan!: string | null;

  @ApiPropertyOptional({ nullable: true, type: Object })
  vitalsJson!: Record<string, unknown> | null;

  @ApiPropertyOptional({ nullable: true })
  heartRate!: number | null;

  @ApiPropertyOptional({ nullable: true })
  spo2!: number | null;

  @ApiPropertyOptional({ nullable: true })
  bpSystolic!: number | null;

  @ApiPropertyOptional({ nullable: true })
  bpDiastolic!: number | null;

  @ApiPropertyOptional({ nullable: true })
  temperature!: number | null;

  @ApiPropertyOptional({ nullable: true })
  weightKg!: number | null;

  @ApiPropertyOptional({ nullable: true })
  heightCm!: number | null;

  @ApiProperty()
  noMedications!: boolean;

  @ApiProperty({ description: "Visit fee captured when the encounter was created (tenant base currency)" })
  visitFeeAmount!: number;

  @ApiPropertyOptional({ nullable: true, description: "Linked booked appointment, if any" })
  appointmentId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  finalizedAt!: string | null;

  @ApiProperty({ type: [DiagnosisDto] })
  diagnoses!: DiagnosisDto[];

  @ApiProperty({ type: [EncounterMedicationDto] })
  medications!: EncounterMedicationDto[];

  @ApiProperty({ type: [EncounterDocumentDto] })
  documents!: EncounterDocumentDto[];

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;
}
