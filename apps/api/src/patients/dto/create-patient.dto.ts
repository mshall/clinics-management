import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Gender } from "@prisma/client";
import { Transform } from "class-transformer";
import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from "class-validator";
import { PatientAcquisitionFieldsDto } from "../../common/dto/patient-acquisition-fields.dto";

export class CreatePatientDto extends PatientAcquisitionFieldsDto {
  @ApiProperty({ minLength: 1, maxLength: 120 })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  firstNameEn!: string;

  @ApiProperty({ minLength: 1, maxLength: 120 })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  lastNameEn!: string;

  @ApiProperty({ maxLength: 120 })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  firstNameAr!: string;

  @ApiProperty({ maxLength: 120 })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  lastNameAr!: string;

  @ApiPropertyOptional({ example: "1988-03-12" })
  @Transform(({ value }) => (typeof value === "string" && !value.trim() ? undefined : value))
  @IsOptional()
  @ValidateIf((_, v) => v !== undefined && v !== null && String(v).trim() !== "")
  @IsDateString()
  dob?: string;

  @ApiProperty({ enum: Gender })
  @IsEnum(Gender)
  gender!: Gender;

  @ApiProperty({ example: "+971501112233" })
  @IsString()
  @MinLength(5)
  @MaxLength(40)
  phone!: string;

  @ApiPropertyOptional({ example: "patient@example.com" })
  @Transform(({ value }) => (typeof value === "string" && !value.trim() ? undefined : value))
  @IsOptional()
  @ValidateIf((_, v) => v !== undefined && v !== null && String(v).trim() !== "")
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @ApiPropertyOptional({ description: "National ID / SSN (unique per organization when provided)" })
  @Transform(({ value }) => (typeof value === "string" && !value.trim() ? undefined : value))
  @IsOptional()
  @IsString()
  @MaxLength(64)
  nationalId?: string;

  @ApiPropertyOptional({ description: "Home branch clinic id" })
  @IsOptional()
  @IsString()
  homeBranchId?: string;
}
