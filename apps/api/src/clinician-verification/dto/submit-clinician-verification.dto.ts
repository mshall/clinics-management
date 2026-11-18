import { ClinicalSpecialty } from "@prisma/client";
import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength } from "class-validator";

export class SubmitClinicianVerificationDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  syndicateNumber?: string;

  @IsOptional()
  @IsEnum(ClinicalSpecialty)
  specialty?: ClinicalSpecialty;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  titleEn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  titleAr?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  nationalId?: string;

  @IsOptional()
  @IsBoolean()
  submit?: boolean;
}