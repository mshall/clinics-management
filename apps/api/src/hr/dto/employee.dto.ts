import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { EmployeeRecordStatus, EmployeeSeparationReason, EmploymentType } from "@prisma/client";
import { EmployeeEmploymentPeriodDto } from "./employee-employment-period.dto";

export class EmployeeDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  clinicId!: string;

  @ApiPropertyOptional({ nullable: true, description: "Clinic display name when joined in list/detail" })
  clinicNameEn!: string | null;

  @ApiPropertyOptional({ nullable: true })
  clinicNameAr!: string | null;

  @ApiProperty()
  employeeNumber!: string;

  @ApiProperty()
  firstNameEn!: string;

  @ApiProperty()
  lastNameEn!: string;

  @ApiPropertyOptional({ nullable: true })
  firstNameAr!: string | null;

  @ApiPropertyOptional({ nullable: true })
  lastNameAr!: string | null;

  @ApiPropertyOptional({ nullable: true })
  email!: string | null;

  @ApiProperty()
  phone!: string;

  @ApiProperty()
  jobTitle!: string;

  @ApiProperty({ enum: EmploymentType })
  employmentType!: EmploymentType;

  @ApiProperty()
  hireDate!: string;

  @ApiProperty()
  salaryBase!: number;

  @ApiPropertyOptional({ nullable: true })
  userId!: string | null;

  @ApiProperty({ description: "Whether an ID / passport document was uploaded" })
  hasIdDoc!: boolean;

  @ApiPropertyOptional({ nullable: true, description: "Linked login account display name" })
  linkedUserDisplayName!: string | null;

  @ApiPropertyOptional({ nullable: true, description: "Linked login account role" })
  linkedUserRole!: string | null;

  @ApiProperty({ type: [String], description: "Clinics assigned to the linked login account" })
  linkedUserClinicIds!: string[];

  @ApiProperty({ description: "Whether the linked login account has a profile picture" })
  hasUserAvatar!: boolean;

  @ApiProperty({ enum: EmployeeRecordStatus })
  recordStatus!: EmployeeRecordStatus;

  @ApiPropertyOptional({ nullable: true })
  resignationDate!: string | null;

  @ApiPropertyOptional({ enum: EmployeeSeparationReason, nullable: true })
  separationReason!: EmployeeSeparationReason | null;

  @ApiProperty({ type: [EmployeeEmploymentPeriodDto] })
  employmentPeriods!: EmployeeEmploymentPeriodDto[];
}
