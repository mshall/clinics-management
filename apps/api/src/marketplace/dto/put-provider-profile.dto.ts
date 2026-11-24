import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsDefined,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from "class-validator";

class ProviderEducationDto {
  @IsString()
  @MaxLength(200)
  degreeEn!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  degreeAr?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  institutionEn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  institutionAr?: string;
}

class ProviderProfileBodyDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  displayNameEn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  displayNameAr?: string;

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
  @MaxLength(64)
  specialty?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  subSpecialties?: string[];

  @IsOptional()
  @IsIn(["MALE", "FEMALE", "UNSPECIFIED"])
  gender?: "MALE" | "FEMALE" | "UNSPECIFIED";

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  languages?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  bioEn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  bioAr?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProviderEducationDto)
  education?: ProviderEducationDto[];

  @IsOptional()
  @IsNumber()
  yearsExperience?: number;

  @IsOptional()
  @IsObject()
  feesByAppointmentTypeId?: Record<string, number>;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  acceptedPayerIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  clinicPhotoRelativePaths?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  amenities?: string[];

  @IsOptional()
  @IsBoolean()
  parking?: boolean;

  @IsOptional()
  @IsBoolean()
  wheelchairAccess?: boolean;
}

export class PutProviderProfileDto {
  @IsDefined()
  @ValidateNested()
  @Type(() => ProviderProfileBodyDto)
  profile!: ProviderProfileBodyDto;

  @IsOptional()
  @IsNumber()
  clinicLatitude?: number;

  @IsOptional()
  @IsNumber()
  clinicLongitude?: number;
}