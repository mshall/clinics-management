import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsNumber, IsOptional, IsString } from "class-validator";
import { Lenient } from "../common/lenient-dto";

/** Body of `putSafetyContact` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class HomeVisitsPutSafetyContactBodyDto {
  @ApiProperty({ type: String })
  @IsString()
  name!: string;

  @ApiProperty({ type: String })
  @IsString()
  phone!: string;
}

/** Body of `assign` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class HomeVisitsAssignBodyDto {
  @ApiProperty({ type: String })
  @IsString()
  clinicianId!: string;
}

/** Body of `depart` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class HomeVisitsDepartBodyDto {
  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lat?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lng?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  etaMinutes?: number;
}

/** Body of `arrive` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class HomeVisitsArriveBodyDto {
  @ApiProperty({ type: Number })
  @Type(() => Number)
  @IsNumber()
  lat!: number;

  @ApiProperty({ type: Number })
  @Type(() => Number)
  @IsNumber()
  lng!: number;
}

/** Body of `finish` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class HomeVisitsFinishBodyDto {
  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lat?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lng?: number;
}

/** Body of `abort` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class HomeVisitsAbortBodyDto {
  @ApiProperty({ type: String })
  @IsString()
  reason!: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  reasonCategory?: string;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lat?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lng?: number;
}

/** Body of `sos` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class HomeVisitsSosBodyDto {
  @ApiProperty({ type: Number })
  @Type(() => Number)
  @IsNumber()
  lat!: number;

  @ApiProperty({ type: Number })
  @Type(() => Number)
  @IsNumber()
  lng!: number;
}
