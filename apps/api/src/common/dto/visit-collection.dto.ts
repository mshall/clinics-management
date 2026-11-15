import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { VisitCollectionMode } from "@prisma/client";
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class VisitCollectionDto {
  @ApiProperty({ enum: VisitCollectionMode })
  @IsEnum(VisitCollectionMode)
  mode!: VisitCollectionMode;

  @ApiPropertyOptional({
    description: "Market-defined transfer channel id (e.g. INSTAPAY, FAWRY) when mode is MONEY_TRANSFER",
  })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  transferChannel?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  transferReference?: string;
}