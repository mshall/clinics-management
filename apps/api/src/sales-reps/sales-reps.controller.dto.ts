import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsArray, IsNumber, IsOptional, IsString } from "class-validator";
import { Lenient } from "../common/lenient-dto";

/** Body of `roi` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class PlatformSalesRepsRoiBodyDto {
  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  noShowsPreventedPerMonth?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  feePerVisit?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  adminHoursSavedPerWeek?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  adminHourlyCost?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  kiorexPatientsPerMonth?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  contributionPerKiorexPatient?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  planMonthlyAmount?: number;
}

/** Body of `confirm` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class PlatformSalesRepsConfirmBodyDto {
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiPropertyOptional({ type: [Object] })
  @IsOptional()
  @IsArray()
  legalAcceptances?: { document: string; version: string }[];
}

/** Body of `upload` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class PlatformSalesRepsUploadBodyDto {
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  entity?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  dedupeMode?: string;
}

/** Body of `create` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class PlatformSalesRepsCreateBodyDto {
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  displayName?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  password?: string;
}
