import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsDateString, IsOptional } from "class-validator";

export class DeactivateTenantUserDto {
  @ApiPropertyOptional({ description: "Resignation / deactivation date (defaults to today)" })
  @IsOptional()
  @IsDateString()
  resignationDate?: string;
}
