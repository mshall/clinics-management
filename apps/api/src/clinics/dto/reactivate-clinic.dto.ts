import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsDateString, IsOptional } from "class-validator";

export class ReactivateClinicDto {
  @ApiPropertyOptional({ description: "First operating day after reactivation (YYYY-MM-DD). Defaults to today." })
  @IsOptional()
  @IsDateString()
  startDate?: string;
}
