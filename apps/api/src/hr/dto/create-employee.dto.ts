import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { EmploymentType } from "@prisma/client";
import { IsArray, IsDateString, IsEmail, IsEnum, IsNumber, IsOptional, IsString, MaxLength, Min } from "class-validator";
import { Type } from "class-transformer";

export class CreateEmployeeDto {
  @ApiProperty()
  @IsString()
  clinicId!: string;

  @ApiPropertyOptional({ type: [String], description: "Additional clinics for physicians (primary is clinicId)" })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  clinicIds?: string[];

  @ApiProperty({ description: "Link to an existing unmapped organization login account" })
  @IsString()
  userId!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(120)
  firstNameEn!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(120)
  lastNameEn!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  firstNameAr?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  lastNameAr?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty()
  @IsString()
  @MaxLength(40)
  phone!: string;

  @ApiPropertyOptional({ description: "Derived from linked user role when omitted" })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  jobTitle?: string;

  @ApiProperty({ enum: EmploymentType })
  @IsEnum(EmploymentType)
  employmentType!: EmploymentType;

  @ApiProperty()
  @IsDateString()
  hireDate!: string;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  salaryBase!: number;
}
