import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { PatientAllergyCode } from "@prisma/client";
import { IsEnum, IsOptional, IsString, MaxLength, MinLength, ValidateIf } from "class-validator";

export class PatientAllergyInputDto {
  @ApiProperty({ enum: PatientAllergyCode })
  @IsEnum(PatientAllergyCode)
  code!: PatientAllergyCode;

  @ApiPropertyOptional({ description: "Required when code is OTHER" })
  @ValidateIf((o) => o.code === PatientAllergyCode.OTHER)
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  otherComment?: string;
}
