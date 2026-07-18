import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsDateString, IsOptional } from "class-validator";

export class DeactivateClinicDto {
  @ApiPropertyOptional({ description: "Last operating day (YYYY-MM-DD). Defaults to today." })
  @IsOptional()
  @IsDateString()
  effectiveDate?: string;
}
