import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsDateString, IsOptional } from "class-validator";

export class ReactivateEmployeeDto {
  @ApiPropertyOptional({ description: "New employment start date (YYYY-MM-DD); defaults to today" })
  @IsOptional()
  @IsDateString()
  startDate?: string;
}
