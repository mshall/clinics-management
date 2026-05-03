import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { AttendanceStatus } from "@prisma/client";

export class AttendanceDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  employeeId!: string;

  @ApiPropertyOptional({ nullable: true })
  employeeNumber!: string | null;

  @ApiPropertyOptional({ nullable: true })
  employeeFullName!: string | null;

  @ApiPropertyOptional({ nullable: true, description: "Employee home clinic (English name)" })
  clinicNameEn!: string | null;

  @ApiProperty()
  workDate!: string;

  @ApiPropertyOptional({ nullable: true })
  clockIn!: string | null;

  @ApiPropertyOptional({ nullable: true })
  clockOut!: string | null;

  @ApiProperty({ enum: AttendanceStatus })
  status!: AttendanceStatus;

  @ApiPropertyOptional({ nullable: true })
  notes!: string | null;
}
