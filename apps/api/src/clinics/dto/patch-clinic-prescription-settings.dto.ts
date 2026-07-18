import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength } from "class-validator";

export class PatchClinicPrescriptionSettingsDto {
  @ApiPropertyOptional({ description: "Header description shown on generated prescriptions (English)" })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  prescriptionHeaderDescriptionEn?: string;

  @ApiPropertyOptional({ description: "Header description shown on generated prescriptions (Arabic)" })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  prescriptionHeaderDescriptionAr?: string;
}
