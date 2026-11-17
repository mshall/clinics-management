import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsOptional, IsString, MaxLength } from "class-validator";

export class CheckInConsentCaptureDto {
  @ApiPropertyOptional({ description: "PDPL / data processing consent" })
  @IsOptional()
  @IsBoolean()
  dataProcessing?: boolean;

  @ApiPropertyOptional({ description: "Consent to send PHI to the AI assistant / LLM" })
  @IsOptional()
  @IsBoolean()
  aiProcessing?: boolean;

  @ApiPropertyOptional({ description: "Consent to share profile with Kiorex / marketplace" })
  @IsOptional()
  @IsBoolean()
  marketplaceSharing?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  signerName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  signedOnTablet?: boolean;
}