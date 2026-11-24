import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { PatientActiveProblemStatus, PatientFamilyRelation } from "@prisma/client";
import { IsDateString, IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";
import { Lenient } from "../common/lenient-dto";

/** Body of `POST patients/:id/active-problems` (was `Record<string, unknown>`). */
@Lenient()
export class PatientActiveProblemBodyDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) id?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20) icd10Code?: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(300) labelEn!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) labelAr?: string;
  @ApiPropertyOptional({ enum: PatientActiveProblemStatus }) @IsOptional() @IsEnum(PatientActiveProblemStatus) status?: PatientActiveProblemStatus;
  @ApiPropertyOptional({ description: "ISO 8601 date" }) @IsOptional() @IsDateString() onsetDate?: string;
}

/** Body of `POST patients/:id/family-links` (was `Record<string, unknown>`). */
@Lenient()
export class PatientFamilyLinkBodyDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(100) toPatientId!: string;
  @ApiProperty({ enum: PatientFamilyRelation }) @IsEnum(PatientFamilyRelation) relation!: PatientFamilyRelation;
}
