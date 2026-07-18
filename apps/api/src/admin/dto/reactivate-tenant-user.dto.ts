import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsDateString, IsOptional } from "class-validator";

export class ReactivateTenantUserDto {
  @ApiPropertyOptional({ description: "Employment restart date (defaults to today)" })
  @IsOptional()
  @IsDateString()
  startDate?: string;
}
