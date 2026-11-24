import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsBoolean, IsNumber, IsOptional, IsString } from "class-validator";
import { Lenient } from "../common/lenient-dto";

/** Body of `startScribe` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class ClinicAiStartScribeBodyDto {
  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @IsBoolean()
  patientConsent?: boolean;

  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @IsBoolean()
  retainAudioAfterSignOff?: boolean;
}

/** Body of `uploadAudio` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class ClinicAiUploadAudioBodyDto {
  @ApiProperty({ type: Number })
  @Type(() => Number)
  @IsNumber()
  seq!: number;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  mimeType?: string;

  @ApiProperty({ type: String })
  @IsString()
  payloadB64!: string;
}

/** Body of `stopScribe` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class ClinicAiStopScribeBodyDto {
  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  audioSeconds?: number;
}
