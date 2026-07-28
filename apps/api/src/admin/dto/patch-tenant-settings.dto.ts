import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsIn, IsNumber, IsOptional, IsString, Min } from "class-validator";
import { BASE_CURRENCIES } from "../../common/base-currencies";

export class PatchTenantSettingsDto {
  @ApiPropertyOptional({
    description: "Organization base currency; inherited by clinics unless they use a custom default",
    enum: BASE_CURRENCIES,
  })
  @IsOptional()
  @IsString()
  @IsIn(BASE_CURRENCIES)
  baseCurrency?: string;

  @ApiPropertyOptional({
    description: "Default visit/consultation fee for new encounters (same currency as tenant base)",
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  defaultVisitFee?: number;
}
