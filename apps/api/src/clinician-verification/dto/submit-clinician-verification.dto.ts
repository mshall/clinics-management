import { ClinicalSpecialty } from "@prisma/client";
import { Type } from "class-transformer";
import { IsArray, IsBoolean, IsDateString, IsEnum, IsOptional, IsString, MaxLength, ValidateNested } from "class-validator";

export class RegistrationInputDto {
  @IsString()
  @MaxLength(64)
  registerCode!: string;

  @IsString()
  @MaxLength(64)
  registrationNumber!: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

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

  /** PRVER01 — one entry per register of the profession's market-pack rule (syndicate number may also be sent as syndicateNumber). */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RegistrationInputDto)
  registrations?: RegistrationInputDto[];

  /** PRVER04 — practising solo (no clinic or agency behind me). */
  @IsOptional()
  @IsBoolean()
  solo?: boolean;
}
