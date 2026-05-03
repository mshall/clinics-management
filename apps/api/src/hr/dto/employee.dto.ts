import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { EmploymentType } from "@prisma/client";

export class EmployeeDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  clinicId!: string;

  @ApiPropertyOptional({ nullable: true, description: "Clinic display name when joined in list/detail" })
  clinicNameEn!: string | null;

  @ApiProperty()
  employeeNumber!: string;

  @ApiProperty()
  firstNameEn!: string;

  @ApiProperty()
  lastNameEn!: string;

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
}
