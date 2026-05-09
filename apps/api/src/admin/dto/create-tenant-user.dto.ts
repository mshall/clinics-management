import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { UserRole } from "@prisma/client";
import { IsArray, IsEmail, IsEnum, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class CreateTenantUserDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  displayName!: string;

  @ApiProperty({ enum: UserRole })
  @IsEnum(UserRole)
  role!: UserRole;

  @ApiPropertyOptional({
    description:
      "When role is CLINIC_ADMIN or BRANCH_MANAGER, assign one or more clinics (and branches) this user may operate within (same scope table).",
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  clinicIds?: string[];
}
