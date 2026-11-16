import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { VisitCollectionMode } from "@prisma/client";
import { IsEnum, IsOptional, IsString, MaxLength } from "class-validator";

export class ScheduledFeeCollectionDto {
  @ApiProperty({ enum: VisitCollectionMode })
  @IsEnum(VisitCollectionMode)
  mode!: VisitCollectionMode;

  @ApiPropertyOptional({ description: "Organization or market transfer channel when mode is MONEY_TRANSFER" })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  transferChannel?: string | null;
}

export type ScheduledFeeCollectionInput = {
  mode: VisitCollectionMode;
  transferChannel?: string | null;
};