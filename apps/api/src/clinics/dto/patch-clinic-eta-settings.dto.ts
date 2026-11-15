import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsBoolean, IsOptional, IsString, MaxLength } from "class-validator";

export class PatchClinicEtaSettingsDto {
  @ApiPropertyOptional({ description: "ETA branch / POS code registered with Egyptian Tax Authority" })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  etaBranchCode?: string | null;

  @ApiPropertyOptional({ description: "Taxpayer activity code (defaults to organization 8690)" })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  etaTaxpayerActivityCode?: string | null;

  @ApiPropertyOptional({ description: "Default GPC/ETA item code for visit-fee lines" })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  etaDefaultItemCode?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  etaReceiptsEnabled?: boolean;

  @ApiPropertyOptional({
    description: "Show clinic invoice logo on patient-facing ETA receipt preview when ETA permits issuer branding",
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  etaIncludeLogoOnReceipt?: boolean;
}