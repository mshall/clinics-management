import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class PatientDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  mrn!: string;

  @ApiProperty()
  firstNameEn!: string;

  @ApiProperty()
  lastNameEn!: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  firstNameAr!: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  lastNameAr!: string | null;

  @ApiProperty({ example: "1988-03-12" })
  dob!: string;

  @ApiProperty({ enum: ["M", "F", "OTHER", "UNKNOWN"] })
  gender!: string;

  @ApiProperty()
  phone!: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  email!: string | null;

  @ApiPropertyOptional({ nullable: true, type: String, description: "Government-issued national / social security identifier" })
  nationalId!: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  homeBranch!: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  homeBranchId!: string | null;
}
