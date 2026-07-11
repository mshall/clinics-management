import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { EmployeeSeparationReason } from "@prisma/client";

export class EmployeeEmploymentPeriodDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  startDate!: string;

  @ApiPropertyOptional({ nullable: true })
  endDate!: string | null;

  @ApiPropertyOptional({ enum: EmployeeSeparationReason, nullable: true })
  separationReason!: EmployeeSeparationReason | null;
}
