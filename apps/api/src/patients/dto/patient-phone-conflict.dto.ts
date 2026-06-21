import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class PatientPhoneConflictPatientDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  mrn!: string;

  @ApiProperty()
  firstNameEn!: string;

  @ApiProperty()
  lastNameEn!: string;

  @ApiPropertyOptional()
  firstNameAr!: string | null;

  @ApiPropertyOptional()
  lastNameAr!: string | null;
}

export class PatientPhoneConflictDto {
  @ApiProperty()
  conflict!: boolean;

  @ApiPropertyOptional({ type: PatientPhoneConflictPatientDto })
  patient?: PatientPhoneConflictPatientDto;
}
