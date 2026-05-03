import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { LeaveStatus, LeaveType } from "@prisma/client";

export class LeaveRequestDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  employeeId!: string;

  @ApiProperty({ enum: LeaveType })
  type!: LeaveType;

  @ApiProperty()
  startDate!: string;

  @ApiProperty()
  endDate!: string;

  @ApiProperty({ enum: LeaveStatus })
  status!: LeaveStatus;

  @ApiPropertyOptional({ nullable: true })
  reason!: string | null;
}
