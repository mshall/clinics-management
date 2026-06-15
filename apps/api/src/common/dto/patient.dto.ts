import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { PatientDocumentDto } from "./patient-document.dto";

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

  @ApiPropertyOptional({ description: "Whether a national ID / SSN scan is on file" })
  hasNationalIdDoc?: boolean;

  @ApiPropertyOptional({
    enum: [
      "SOCIAL_FACEBOOK",
      "SOCIAL_INSTAGRAM",
      "SOCIAL_TIKTOK",
      "WEBSITE_GOOGLE",
      "DOCTOR_REFERRAL",
      "OTHER",
    ],
    nullable: true,
    type: String,
  })
  acquisitionChannel!: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  acquisitionReferralName!: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  acquisitionOtherDetail!: string | null;

  @ApiPropertyOptional({ type: [PatientDocumentDto] })
  documents?: PatientDocumentDto[];
}
