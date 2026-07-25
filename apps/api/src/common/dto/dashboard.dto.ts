import { ApiProperty } from "@nestjs/swagger";
import { CurrencyTotalDto } from "./currency-totals.dto";

export class GroupOverviewKpisDto {
  @ApiProperty()
  patients!: number;

  @ApiProperty({ description: "Finalized encounters with finalizedAt in the reporting period (legacy)" })
  encounters30d!: number;

  @ApiProperty({ description: "All encounters with createdAt in the reporting period" })
  encountersPeriodTotal!: number;

  @ApiProperty({ description: "Appointments with startsAt in the reporting period" })
  appointmentsPeriodTotal!: number;

  @ApiProperty({ description: "Legacy mixed-currency revenue sum for the period" })
  revenueMonth!: number;

  @ApiProperty({ description: "Legacy mixed-currency expense sum for the period" })
  expensesMonth!: number;

  @ApiProperty({ description: "Legacy mixed-currency net for the period" })
  netProfitMonth!: number;

  @ApiProperty({ type: [CurrencyTotalDto] })
  revenueByCurrency!: CurrencyTotalDto[];

  @ApiProperty({ type: [CurrencyTotalDto] })
  expensesByCurrency!: CurrencyTotalDto[];

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
