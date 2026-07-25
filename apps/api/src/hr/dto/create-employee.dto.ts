import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { EmploymentType, UserRole } from "@prisma/client";
import { IsArray, IsDateString, IsEmail, IsEnum, IsNumber, IsOptional, IsString, MaxLength, Min, MinLength } from "class-validator";
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

  @ApiPropertyOptional({ description: "Link to an existing unmapped organization login account" })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional({ description: "Create a new login — email for the employee account" })
  @IsOptional()
  @IsEmail()
  loginEmail?: string;

  @ApiPropertyOptional({ minLength: 8, description: "Create a new login — temporary password" })
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  loginPassword?: string;

  @ApiPropertyOptional({ enum: UserRole, description: "Create a new login — organization role" })
  @IsOptional()
  @IsEnum(UserRole)
  loginRole?: UserRole;

  @ApiPropertyOptional({
    enum: ["CLINIC", "GROUP"],
    description: "For physicians: assign to this clinic only or as a group physician across the clinic network",
  })
  @IsOptional()
  @IsEnum(["CLINIC", "GROUP"] as const)
  physicianAssignment?: "CLINIC" | "GROUP";

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

  @ApiPropertyOptional({
    description: "Salary currency override; omit or match clinic default to follow clinic defaultCurrency",
  })
  @IsOptional()
  @IsString()
  salaryCurrency?: string | null;
}
