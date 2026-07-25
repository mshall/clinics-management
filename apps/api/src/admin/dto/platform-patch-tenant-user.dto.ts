import { ApiPropertyOptional } from "@nestjs/swagger";
import { EmploymentType, UserRole } from "@prisma/client";
import { IsArray, IsEmail, IsEnum, IsNumber, IsOptional, IsString, MaxLength, Min, MinLength } from "class-validator";

export class PlatformPatchTenantUserDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ minLength: 8 })
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  displayName?: string;

  @ApiPropertyOptional({ enum: UserRole })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @ApiPropertyOptional({ type: [String], description: "Clinic scope for CLINIC_ADMIN / BRANCH_MANAGER" })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  clinicIds?: string[];

  @ApiPropertyOptional({ enum: EmploymentType, description: "Linked HR employee contract type" })
  @IsOptional()
  @IsEnum(EmploymentType)
  employmentType?: EmploymentType;

  @ApiPropertyOptional({ description: "Linked HR employee monthly base salary" })
  @IsOptional()
  @IsNumber()
  @Min(0)
  salaryBase?: number;

  @ApiPropertyOptional({ description: "Linked HR employee salary currency override" })
  @IsOptional()
  @IsString()
  salaryCurrency?: string | null;
}
