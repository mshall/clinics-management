import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsBoolean, IsNumber, IsOptional, IsString } from "class-validator";
import { Lenient } from "../common/lenient-dto";

/** Body of `escalateEngineering` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class SupportEscalateEngineeringBodyDto {
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  note?: string;
}

/** Body of `requestAccess` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class SupportRequestAccessBodyDto {
  @ApiProperty({ type: String })
  @IsString()
  tenantId!: string;

  @ApiProperty({ type: String })
  @IsString()
  reason!: string;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  durationMinutes?: number;

  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @IsBoolean()
  requestedUnmaskPhi?: boolean;
}

/** Body of `decideAccess` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class SupportDecideAccessBodyDto {
  @ApiProperty({ type: Boolean })
  @IsBoolean()
  approved!: boolean;

  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @IsBoolean()
  allowUnmaskPhi?: boolean;
}
