import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsArray, IsBoolean, IsNumber, IsOptional, IsString } from "class-validator";
import { Lenient } from "../common/lenient-dto";

/** Body of `putSchedule` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class ReportsPutScheduleBodyDto {
  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  format?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  reportKeys?: string[];

  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @IsBoolean()
  channelEmail?: boolean;

  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @IsBoolean()
  channelWhatsApp?: boolean;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  dayOfWeek?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  hourLocal?: number;
}
