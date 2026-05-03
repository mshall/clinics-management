import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsNumber, IsOptional, Min } from "class-validator";

export class PatchTenantSettingsDto {
  @ApiPropertyOptional({ description: "Default appointment fee (same currency as tenant base), used when booking" })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  appointmentDefaultFee?: number;
}
