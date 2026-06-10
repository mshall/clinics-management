import { ApiPropertyOptional } from "@nestjs/swagger";
import { UserRole } from "@prisma/client";
import { IsArray, IsEmail, IsEnum, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

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
}
