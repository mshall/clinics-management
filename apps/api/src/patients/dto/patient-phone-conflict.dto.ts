import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class PatientPhoneConflictPatientDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  mrn!: string;

  @ApiProperty()
  phone!: string;

  @ApiProperty()
  firstNameEn!: string;

  @ApiProperty()
  lastNameEn!: string;

  @ApiPropertyOptional()
  firstNameAr!: string | null;

  @ApiPropertyOptional()
  lastNameAr!: string | null;

  @ApiPropertyOptional()
  dob!: string | null;

  @ApiProperty()
  gender!: string;

  @ApiProperty()
  profileComplete!: boolean;

  @ApiPropertyOptional()
  createdAt!: string | null;
}

export class PatientPhoneConflictDto {
  @ApiProperty()
  conflict!: boolean;

  @ApiPropertyOptional({ type: PatientPhoneConflictPatientDto })
  patient?: PatientPhoneConflictPatientDto;
}
