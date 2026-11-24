import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { Allow, IsBoolean, IsNumber, IsOptional, IsString } from "class-validator";
import { Lenient } from "../common/lenient-dto";

/** Body of `putSettings` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class TelehealthPutSettingsBodyDto {
  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @IsBoolean()
  offersTelehealth?: boolean;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @Allow()
  windows?: unknown;
}

/** Body of `configureType` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class TelehealthConfigureTypeBodyDto {
  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  durationMinutes?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  feeAmount?: number;

  @ApiPropertyOptional({ type: Number, nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  depositAmount?: number | null;

  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @IsBoolean()
  marketplaceBookable?: boolean;
}

/** Body of `postSignal` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class TelehealthPostSignalBodyDto {
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @Allow()
  payload?: unknown;
}

/** Body of `mode` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class TelehealthModeBodyDto {
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  mode?: string;
}
