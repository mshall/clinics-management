import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { PatientAllergyCode } from "@prisma/client";

export class PatientAllergyDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: PatientAllergyCode })
  code!: PatientAllergyCode;

  @ApiPropertyOptional({ nullable: true, type: String })
  otherComment!: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  encounterId!: string | null;

  @ApiProperty()
  createdAt!: string;
}
