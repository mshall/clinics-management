import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { EmploymentType } from "@prisma/client";
import { IsDateString, IsEmail, IsEnum, IsNumber, IsOptional, IsString, MaxLength, Min } from "class-validator";
import { Type } from "class-transformer";

export class CreateEmployeeDto {
  @ApiProperty()
  @IsString()
  clinicId!: string;

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

  @ApiProperty()
  @IsString()
  @MaxLength(120)
  jobTitle!: string;

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
