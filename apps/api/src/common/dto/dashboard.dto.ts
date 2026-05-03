import { ApiProperty } from "@nestjs/swagger";

export class GroupOverviewKpisDto {
  @ApiProperty()
  patients!: number;

  @ApiProperty({ description: "Finalized encounters with finalizedAt in the reporting period (legacy)" })
  encounters30d!: number;

  @ApiProperty({ description: "All encounters with createdAt in the reporting period" })
  encountersPeriodTotal!: number;

  @ApiProperty({ description: "Appointments with startsAt in the reporting period" })
  appointmentsPeriodTotal!: number;

  @ApiProperty()
  revenueMonth!: number;

  @ApiProperty()
  expensesMonth!: number;

  @ApiProperty({ description: "Revenue minus expenses for the selected period" })
  netProfitMonth!: number;

  @ApiProperty({ description: "Applied range start (YYYY-MM-DD, local)", example: "2025-05-01" })
  periodFrom!: string;

  @ApiProperty({ description: "Applied range end (YYYY-MM-DD, local)", example: "2025-05-31" })
  periodTo!: string;

  @ApiProperty()
  branches!: number;

  @ApiProperty({ description: "User accounts in tenant" })
  headcount!: number;

  @ApiProperty({ description: "HR employee records" })
  employeeCount!: number;
}
