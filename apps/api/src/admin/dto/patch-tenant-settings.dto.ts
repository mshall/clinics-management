import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsNumber, IsOptional, Min } from "class-validator";

export class PatchTenantSettingsDto {
  @ApiPropertyOptional({
    description: "Default visit/consultation fee for new encounters (same currency as tenant base)",
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  defaultVisitFee?: number;
}
