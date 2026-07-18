import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class ClinicOperatingPeriodDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ description: "First day of this operating period (YYYY-MM-DD)" })
  startDate!: string;

  @ApiPropertyOptional({ nullable: true, description: "Last day of this operating period (YYYY-MM-DD)" })
  endDate!: string | null;
}
