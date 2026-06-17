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
      "Assign one or more clinics. Required for clinic administrator and branch manager; optional for other roles.",
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  clinicIds?: string[];
}
